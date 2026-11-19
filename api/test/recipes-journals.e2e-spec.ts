import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

const UNKNOWN_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const newRecipe = (overrides: Record<string, unknown> = {}) => ({
  title: "Grandma's Banana Bread",
  description: 'Moist and dense.',
  tags: ['Baking', 'breakfast', 'baking'],
  timeEstimateMinutes: 75,
  ingredients: [
    { quantity: 2, unit: 'cup', ingredient: 'flour', adjective: 'sifted' },
    { quantity: 3, ingredient: 'bananas' },
  ],
  steps: ['Preheat the oven to 350F.', 'Mash the bananas.'],
  ...overrides,
});

interface Account {
  id: string;
  username: string;
  auth: { Authorization: string };
}

describe('Recipes & journals (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  let connection: Connection;
  let userCount = 0;

  const http = () => request(app.getHttpServer());

  async function register(): Promise<Account> {
    userCount += 1;
    const username = `cook${userCount}`;
    const res = await http()
      .post('/api/v1/users')
      .send({
        username,
        password: 'password123',
        email: `${username}@example.com`,
        firstName: 'Test',
        lastName: 'Cook',
      })
      .expect(201);
    return {
      id: res.body.id,
      username,
      auth: { Authorization: `Bearer ${res.body.accessToken}` },
    };
  }

  async function createRecipe(
    owner: Account,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/api/v1/recipes')
      .set(owner.auth)
      .send(newRecipe(overrides))
      .expect(201);
    return res.body as { id: string };
  }

  async function addJournal(owner: Account, recipeId: string, content: string) {
    const res = await http()
      .post(`/api/v1/recipes/${recipeId}/journals`)
      .set(owner.auth)
      .send({ content })
      .expect(201);
    return res.body as { id: string };
  }

  async function archive(owner: Account, recipeId: string) {
    await http()
      .delete(`/api/v1/recipes/${recipeId}`)
      .set(owner.auth)
      .expect(200);
  }

  /** Makes postedAt/publishedAt deterministic so ordering can be asserted. */
  async function setDate(
    collection: string,
    id: string,
    field: string,
    iso: string,
  ) {
    await connection
      .collection(collection)
      .updateOne({ _id: id as any }, { $set: { [field]: new Date(iso) } });
  }

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('crumbtrail-e2e');

    // Imported after MONGODB_URI is set, since config is read at import time.
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication()) as typeof app;
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'recipes', 'journals'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  describe('POST /api/v1/recipes', () => {
    it('creates a recipe authored by the caller', async () => {
      const owner = await register();
      const res = await http()
        .post('/api/v1/recipes')
        .set(owner.auth)
        .send(newRecipe())
        .expect(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        author: { id: owner.id, username: owner.username },
        title: "Grandma's Banana Bread",
        description: 'Moist and dense.',
        tags: ['baking', 'breakfast'],
        timeEstimateMinutes: 75,
        ingredients: [
          {
            quantity: 2,
            unit: 'cup',
            ingredient: 'flour',
            adjective: 'sifted',
          },
          { quantity: 3, unit: null, ingredient: 'bananas', adjective: null },
        ],
        steps: ['Preheat the oven to 350F.', 'Mash the bananas.'],
        publishedAt: expect.any(String),
        editedAt: null,
        journals: [],
      });
    });

    it('defaults the optional fields', async () => {
      const owner = await register();
      const res = await http()
        .post('/api/v1/recipes')
        .set(owner.auth)
        .send({
          title: 'Toast',
          ingredients: [
            { quantity: 1, unit: 'slice', ingredient: 'bread' },
            { ingredient: 'salt', adjective: 'to taste' },
          ],
          steps: ['Toast it.'],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        description: null,
        tags: [],
        timeEstimateMinutes: null,
      });
      expect(res.body.ingredients[1]).toEqual({
        quantity: null,
        unit: null,
        ingredient: 'salt',
        adjective: 'to taste',
      });
    });

    it.each([
      ['a missing title', { title: undefined }],
      ['no ingredients', { ingredients: [] }],
      ['no steps', { steps: [] }],
      ['a zero quantity', { ingredients: [{ quantity: 0, ingredient: 'x' }] }],
      ['a fractional time estimate', { timeEstimateMinutes: 1.5 }],
      [
        'too many tags',
        { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
      ],
      ['an author field', { authorId: UNKNOWN_ID }],
      [
        'an unknown ingredient field',
        { ingredients: [{ quantity: 1, ingredient: 'x', brand: 'y' }] },
      ],
    ])('rejects %s with 400', async (_label, overrides) => {
      const owner = await register();
      const res = await http()
        .post('/api/v1/recipes')
        .set(owner.auth)
        .send(newRecipe(overrides));
      expect(res.status).toBe(400);
    });

    it('requires a token', async () => {
      await http().post('/api/v1/recipes').send(newRecipe()).expect(401);
    });
  });

  describe('GET /api/v1/recipes/:id', () => {
    it('returns the recipe with its journal entries, newest first, without auth', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      const older = await addJournal(owner, id, 'First bake.');
      const newer = await addJournal(owner, id, 'Second bake.');
      await setDate('journals', older.id, 'postedAt', '2026-01-01T00:00:00Z');
      await setDate('journals', newer.id, 'postedAt', '2026-02-01T00:00:00Z');

      const res = await http().get(`/api/v1/recipes/${id}`).expect(200);
      expect(res.body.id).toBe(id);
      expect(res.body.author).toEqual({
        id: owner.id,
        username: owner.username,
      });
      expect(res.body.journals.map((j: { id: string }) => j.id)).toEqual([
        newer.id,
        older.id,
      ]);
      expect(res.body.journals[0]).toEqual({
        id: newer.id,
        recipeId: id,
        content: 'Second bake.',
        postedAt: '2026-02-01T00:00:00.000Z',
        editedAt: null,
      });
    });

    it('returns 400 for an id that is not a GUID', async () => {
      await http().get('/api/v1/recipes/not-a-guid').expect(400);
    });

    it('returns 404 for an unknown recipe', async () => {
      await http().get(`/api/v1/recipes/${UNKNOWN_ID}`).expect(404);
    });

    it('returns 404 for an archived recipe, even to its author', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await archive(owner, id);
      await http().get(`/api/v1/recipes/${id}`).expect(404);
      await http().get(`/api/v1/recipes/${id}`).set(owner.auth).expect(404);
    });

    it('returns 404 when the author is deactivated', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http()
        .delete(`/api/v1/users/${owner.id}`)
        .set(owner.auth)
        .expect(200);
      await http().get(`/api/v1/recipes/${id}`).expect(404);
    });
  });

  describe('GET /api/v1/recipes/me', () => {
    it("lists only the caller's live recipes, newest first, with journal counts", async () => {
      const owner = await register();
      const other = await register();
      const older = await createRecipe(owner, { title: 'Older' });
      const newer = await createRecipe(owner, { title: 'Newer' });
      const archived = await createRecipe(owner, { title: 'Archived' });
      await createRecipe(other, { title: 'Not mine' });
      await setDate('recipes', older.id, 'publishedAt', '2026-01-01T00:00:00Z');
      await setDate('recipes', newer.id, 'publishedAt', '2026-02-01T00:00:00Z');
      await archive(owner, archived.id);
      await addJournal(owner, older.id, 'One.');
      await addJournal(owner, older.id, 'Two.');

      const res = await http()
        .get('/api/v1/recipes/me')
        .set(owner.auth)
        .expect(200);
      expect(
        res.body.map((r: { title: string; journalCount: number }) => [
          r.title,
          r.journalCount,
        ]),
      ).toEqual([
        ['Newer', 0],
        ['Older', 2],
      ]);
      expect(res.body[0]).not.toHaveProperty('journals');
      expect(res.body[0].author).toEqual({
        id: owner.id,
        username: owner.username,
      });
    });

    it('returns an empty list for a user without recipes', async () => {
      const owner = await register();
      const res = await http()
        .get('/api/v1/recipes/me')
        .set(owner.auth)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('requires a token', async () => {
      await http().get('/api/v1/recipes/me').expect(401);
    });
  });

  describe('PATCH /api/v1/recipes/:id', () => {
    it('updates the given fields, replaces arrays and sets editedAt', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await addJournal(owner, id, 'Notes.');

      const res = await http()
        .patch(`/api/v1/recipes/${id}`)
        .set(owner.auth)
        .send({
          title: 'Banana Bread v2',
          steps: ['Just bake it.'],
          description: null,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        title: 'Banana Bread v2',
        description: null,
        steps: ['Just bake it.'],
        tags: ['baking', 'breakfast'],
        timeEstimateMinutes: 75,
      });
      expect(new Date(res.body.editedAt).getTime()).not.toBeNaN();
      expect(res.body.journals).toHaveLength(1);
    });

    it.each([
      ['an empty body', {}],
      ['an invalid value', { title: '' }],
      ['an unknown field', { archived: false }],
    ])('rejects %s with 400', async (_label, body) => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http()
        .patch(`/api/v1/recipes/${id}`)
        .set(owner.auth)
        .send(body)
        .expect(400);
    });

    it('returns 400 for an id that is not a GUID', async () => {
      const owner = await register();
      await http()
        .patch('/api/v1/recipes/not-a-guid')
        .set(owner.auth)
        .send({ title: 'X' })
        .expect(400);
    });

    it('requires a token', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http()
        .patch(`/api/v1/recipes/${id}`)
        .send({ title: 'X' })
        .expect(401);
    });

    it("forbids editing someone else's recipe", async () => {
      const owner = await register();
      const other = await register();
      const { id } = await createRecipe(owner);
      await http()
        .patch(`/api/v1/recipes/${id}`)
        .set(other.auth)
        .send({ title: 'Hacked' })
        .expect(403);
    });

    it('returns 404 for an unknown or archived recipe', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await archive(owner, id);
      for (const target of [id, UNKNOWN_ID]) {
        await http()
          .patch(`/api/v1/recipes/${target}`)
          .set(owner.auth)
          .send({ title: 'X' })
          .expect(404);
      }
    });
  });

  describe('DELETE /api/v1/recipes/:id', () => {
    it('archives the recipe (soft delete)', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      const res = await http()
        .delete(`/api/v1/recipes/${id}`)
        .set(owner.auth)
        .expect(200);
      expect(res.body).toEqual({ id, archived: true });

      const doc = await connection
        .collection('recipes')
        .findOne({ _id: id as any });
      expect(doc?.archived).toBe(true);
    });

    it('returns 404 when archiving twice or for an unknown recipe', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await archive(owner, id);
      await http().delete(`/api/v1/recipes/${id}`).set(owner.auth).expect(404);
      await http()
        .delete(`/api/v1/recipes/${UNKNOWN_ID}`)
        .set(owner.auth)
        .expect(404);
    });

    it('returns 400 for an id that is not a GUID', async () => {
      const owner = await register();
      await http()
        .delete('/api/v1/recipes/not-a-guid')
        .set(owner.auth)
        .expect(400);
    });

    it('requires a token', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http().delete(`/api/v1/recipes/${id}`).expect(401);
    });

    it("forbids archiving someone else's recipe", async () => {
      const owner = await register();
      const other = await register();
      const { id } = await createRecipe(owner);
      await http().delete(`/api/v1/recipes/${id}`).set(other.auth).expect(403);
    });
  });

  describe('POST /api/v1/recipes/:recipeId/journals', () => {
    it('adds an entry without changing the recipe editedAt', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      const res = await http()
        .post(`/api/v1/recipes/${id}/journals`)
        .set(owner.auth)
        .send({ content: '  Used brown butter.  ' })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        recipeId: id,
        content: 'Used brown butter.',
        postedAt: expect.any(String),
        editedAt: null,
      });

      const recipe = await http().get(`/api/v1/recipes/${id}`).expect(200);
      expect(recipe.body.editedAt).toBeNull();
    });

    it.each([
      ['empty content', { content: '   ' }],
      ['missing content', {}],
      ['an unknown field', { content: 'x', recipeId: UNKNOWN_ID }],
    ])('rejects %s with 400', async (_label, body) => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http()
        .post(`/api/v1/recipes/${id}/journals`)
        .set(owner.auth)
        .send(body)
        .expect(400);
    });

    it('returns 400 for a recipe id that is not a GUID', async () => {
      const owner = await register();
      await http()
        .post('/api/v1/recipes/not-a-guid/journals')
        .set(owner.auth)
        .send({ content: 'x' })
        .expect(400);
    });

    it('requires a token', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await http()
        .post(`/api/v1/recipes/${id}/journals`)
        .send({ content: 'x' })
        .expect(401);
    });

    it("forbids adding entries to someone else's recipe", async () => {
      const owner = await register();
      const other = await register();
      const { id } = await createRecipe(owner);
      await http()
        .post(`/api/v1/recipes/${id}/journals`)
        .set(other.auth)
        .send({ content: 'x' })
        .expect(403);
    });

    it('returns 404 for an unknown or archived recipe', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await archive(owner, id);
      for (const target of [id, UNKNOWN_ID]) {
        await http()
          .post(`/api/v1/recipes/${target}/journals`)
          .set(owner.auth)
          .send({ content: 'x' })
          .expect(404);
      }
    });
  });

  describe('GET /api/v1/recipes/:recipeId/journals', () => {
    it("lists the recipe's entries, newest first, without auth", async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      const older = await addJournal(owner, id, 'Older.');
      const newer = await addJournal(owner, id, 'Newer.');
      await setDate('journals', older.id, 'postedAt', '2026-01-01T00:00:00Z');
      await setDate('journals', newer.id, 'postedAt', '2026-02-01T00:00:00Z');
      const otherRecipe = await createRecipe(owner);
      await addJournal(owner, otherRecipe.id, 'Elsewhere.');

      const res = await http()
        .get(`/api/v1/recipes/${id}/journals`)
        .expect(200);
      expect(res.body.map((j: { content: string }) => j.content)).toEqual([
        'Newer.',
        'Older.',
      ]);
    });

    it('returns 400 for a recipe id that is not a GUID', async () => {
      await http().get('/api/v1/recipes/not-a-guid/journals').expect(400);
    });

    it('returns 404 for an unknown or archived recipe', async () => {
      const owner = await register();
      const { id } = await createRecipe(owner);
      await addJournal(owner, id, 'Hidden.');
      await archive(owner, id);
      await http().get(`/api/v1/recipes/${id}/journals`).expect(404);
      await http().get(`/api/v1/recipes/${UNKNOWN_ID}/journals`).expect(404);
    });
  });

  describe('GET /api/v1/journals/:id', () => {
    it('returns the entry without auth', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Notes.');
      const res = await http().get(`/api/v1/journals/${id}`).expect(200);
      expect(res.body).toMatchObject({ id, recipeId, content: 'Notes.' });
    });

    it('returns 400 for an id that is not a GUID', async () => {
      await http().get('/api/v1/journals/not-a-guid').expect(400);
    });

    it('returns 404 for an unknown entry or one on an archived recipe', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Notes.');
      await archive(owner, recipeId);
      await http().get(`/api/v1/journals/${id}`).expect(404);
      await http().get(`/api/v1/journals/${UNKNOWN_ID}`).expect(404);
    });
  });

  describe('PATCH /api/v1/journals/:id', () => {
    it('replaces the content and sets editedAt', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Draft.');
      const res = await http()
        .patch(`/api/v1/journals/${id}`)
        .set(owner.auth)
        .send({ content: 'Final.' })
        .expect(200);
      expect(res.body).toMatchObject({ id, recipeId, content: 'Final.' });
      expect(new Date(res.body.editedAt).getTime()).not.toBeNaN();
    });

    it.each([
      ['empty content', { content: '' }],
      ['an empty body', {}],
      ['an unknown field', { content: 'x', postedAt: '2020-01-01' }],
    ])('rejects %s with 400', async (_label, body) => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Draft.');
      await http()
        .patch(`/api/v1/journals/${id}`)
        .set(owner.auth)
        .send(body)
        .expect(400);
    });

    it('returns 400 for an id that is not a GUID', async () => {
      const owner = await register();
      await http()
        .patch('/api/v1/journals/not-a-guid')
        .set(owner.auth)
        .send({ content: 'x' })
        .expect(400);
    });

    it('requires a token', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Draft.');
      await http()
        .patch(`/api/v1/journals/${id}`)
        .send({ content: 'x' })
        .expect(401);
    });

    it("forbids editing entries on someone else's recipe", async () => {
      const owner = await register();
      const other = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Draft.');
      await http()
        .patch(`/api/v1/journals/${id}`)
        .set(other.auth)
        .send({ content: 'Hacked' })
        .expect(403);
    });

    it('returns 404 for an unknown entry or one on an archived recipe', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Draft.');
      await archive(owner, recipeId);
      for (const target of [id, UNKNOWN_ID]) {
        await http()
          .patch(`/api/v1/journals/${target}`)
          .set(owner.auth)
          .send({ content: 'x' })
          .expect(404);
      }
    });
  });

  describe('DELETE /api/v1/journals/:id', () => {
    it('deletes the entry permanently', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Bye.');
      const res = await http()
        .delete(`/api/v1/journals/${id}`)
        .set(owner.auth)
        .expect(204);
      expect(res.body).toEqual({});

      const doc = await connection
        .collection('journals')
        .findOne({ _id: id as any });
      expect(doc).toBeNull();
      await http().get(`/api/v1/journals/${id}`).expect(404);
    });

    it('returns 400 for an id that is not a GUID', async () => {
      const owner = await register();
      await http()
        .delete('/api/v1/journals/not-a-guid')
        .set(owner.auth)
        .expect(400);
    });

    it('requires a token', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Bye.');
      await http().delete(`/api/v1/journals/${id}`).expect(401);
    });

    it("forbids deleting entries on someone else's recipe", async () => {
      const owner = await register();
      const other = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Bye.');
      await http().delete(`/api/v1/journals/${id}`).set(other.auth).expect(403);
    });

    it('returns 404 for an unknown entry or one on an archived recipe', async () => {
      const owner = await register();
      const { id: recipeId } = await createRecipe(owner);
      const { id } = await addJournal(owner, recipeId, 'Bye.');
      await archive(owner, recipeId);
      for (const target of [id, UNKNOWN_ID]) {
        await http()
          .delete(`/api/v1/journals/${target}`)
          .set(owner.auth)
          .expect(404);
      }
    });
  });
});
