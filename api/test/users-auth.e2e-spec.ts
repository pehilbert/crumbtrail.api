import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

const newUser = (overrides: Record<string, unknown> = {}) => ({
  username: 'johnny123',
  password: 'password123',
  email: 'johnnyboy@example.com',
  firstName: 'John',
  lastName: 'Smith',
  pronouns: 'he/him',
  ...overrides,
});

describe('Users & auth (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  let connection: Connection;

  const http = () => request(app.getHttpServer());

  async function register(overrides: Record<string, unknown> = {}) {
    const res = await http().post('/api/v1/users').send(newUser(overrides));
    expect(res.status).toBe(201);
    return res.body as { id: string; accessToken: string };
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
    await connection.collection('users').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  describe('POST /api/v1/users', () => {
    it('registers a user and returns a GUID id and a working token', async () => {
      const { id, accessToken } = await register();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);

      const me = await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({ id, email: 'johnnyboy@example.com' });
    });

    it('stores a hashed password, never the plain one', async () => {
      const { id } = await register();
      const doc = await connection
        .collection('users')
        .findOne({ _id: id as any });
      expect(doc?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(doc)).not.toContain('password123');
    });

    it('defaults pronouns to null', async () => {
      const { id } = await register({ pronouns: undefined });
      const res = await http().get(`/api/v1/users/${id}`).expect(200);
      expect(res.body.pronouns).toBeNull();
    });

    it.each([
      ['missing fields', { email: undefined }],
      ['short password', { password: 'short' }],
      ['bad email', { email: 'not-an-email' }],
      ['username with @', { username: 'john@doe' }],
      ['unknown field', { avatar: 'x' }],
    ])('rejects %s with 400', async (_label, overrides) => {
      const res = await http().post('/api/v1/users').send(newUser(overrides));
      expect(res.status).toBe(400);
      expect(res.body.message).toBeInstanceOf(Array);
    });

    it('rejects a duplicate username regardless of case with 409', async () => {
      await register();
      const res = await http()
        .post('/api/v1/users')
        .send(newUser({ username: 'JOHNNY123', email: 'other@example.com' }));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('username is already taken');
    });

    it('rejects a duplicate email regardless of case with 409', async () => {
      await register();
      const res = await http()
        .post('/api/v1/users')
        .send(newUser({ username: 'other', email: 'JohnnyBoy@Example.com' }));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('email is already taken');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it.each([
      ['username', 'johnny123'],
      ['username in another case', 'Johnny123'],
      ['email', 'johnnyboy@example.com'],
      ['email in another case', 'JohnnyBoy@Example.com'],
    ])('logs in with %s', async (_label, login) => {
      const { id } = await register();
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ login, password: 'password123' })
        .expect(200);
      expect(res.body.id).toBe(id);
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('returns the same 401 for a wrong password and an unknown user', async () => {
      await register();
      const wrongPassword = await http()
        .post('/api/v1/auth/login')
        .send({ login: 'johnny123', password: 'wrong-password' })
        .expect(401);
      const unknownUser = await http()
        .post('/api/v1/auth/login')
        .send({ login: 'nobody', password: 'password123' })
        .expect(401);
      expect(wrongPassword.body).toEqual(unknownUser.body);
    });

    it('rejects an invalid body with 400', async () => {
      await http()
        .post('/api/v1/auth/login')
        .send({ username: 'johnny123', password: 'password123' })
        .expect(400);
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('requires a token', async () => {
      await http().get('/api/v1/users/me').expect(401);
    });

    it('rejects a malformed or forged token', async () => {
      await http()
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('returns the private profile including email and join date', async () => {
      const { id, accessToken } = await register();
      const res = await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body).toEqual({
        id,
        username: 'johnny123',
        email: 'johnnyboy@example.com',
        firstName: 'John',
        lastName: 'Smith',
        pronouns: 'he/him',
        joinDate: expect.any(String),
      });
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('returns the public profile without auth, and no email or password', async () => {
      const { id } = await register();
      const res = await http().get(`/api/v1/users/${id}`).expect(200);
      expect(res.body).toEqual({
        id,
        username: 'johnny123',
        firstName: 'John',
        lastName: 'Smith',
        pronouns: 'he/him',
        joinDate: expect.any(String),
      });
      expect(new Date(res.body.joinDate).getTime()).not.toBeNaN();
    });

    it('returns 400 for an id that is not a GUID', async () => {
      await http().get('/api/v1/users/not-a-guid').expect(400);
    });

    it('returns 404 for an unknown user', async () => {
      await http()
        .get('/api/v1/users/7c9e6679-7425-40de-944b-e07fc1f90ae7')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('updates allowed fields and returns the updated profile', async () => {
      const { id, accessToken } = await register();
      const res = await http()
        .patch(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Johnny', pronouns: null })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        firstName: 'Johnny',
        lastName: 'Smith',
        pronouns: null,
      });
    });

    it('allows changing the username, which still must be unique', async () => {
      const { id, accessToken } = await register();
      await register({ username: 'taken', email: 'taken@example.com' });

      await http()
        .patch(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ username: 'TAKEN' })
        .expect(409);
      await http()
        .patch(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ username: 'johnny_new' })
        .expect(200);
      await http()
        .post('/api/v1/auth/login')
        .send({ login: 'johnny_new', password: 'password123' })
        .expect(200);
    });

    it.each([
      ['an empty body', {}],
      ['an email change', { email: 'new@example.com' }],
      ['a password change', { password: 'newpassword123' }],
      ['an invalid value', { firstName: '' }],
    ])('rejects %s with 400', async (_label, body) => {
      const { id, accessToken } = await register();
      await http()
        .patch(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);
    });

    it('requires a token', async () => {
      const { id } = await register();
      await http()
        .patch(`/api/v1/users/${id}`)
        .send({ firstName: 'X' })
        .expect(401);
    });

    it("forbids updating someone else's account", async () => {
      const { accessToken } = await register();
      const other = await register({
        username: 'other',
        email: 'o@example.com',
      });
      await http()
        .patch(`/api/v1/users/${other.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Hacked' })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('deactivates the account and locks it out everywhere', async () => {
      const { id, accessToken } = await register();
      const auth = { Authorization: `Bearer ${accessToken}` };

      const res = await http()
        .delete(`/api/v1/users/${id}`)
        .set(auth)
        .expect(200);
      expect(res.body).toEqual({ id, active: false });

      // Soft delete: the document is still there, flagged inactive.
      const doc = await connection
        .collection('users')
        .findOne({ _id: id as any });
      expect(doc?.active).toBe(false);

      await http().get(`/api/v1/users/${id}`).expect(404);
      await http().get('/api/v1/users/me').set(auth).expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ login: 'johnny123', password: 'password123' })
        .expect(401);
    });

    it('keeps the username and email reserved after deactivation', async () => {
      const { id, accessToken } = await register();
      await http()
        .delete(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await http().post('/api/v1/users').send(newUser()).expect(409);
    });

    it("forbids deactivating someone else's account", async () => {
      const { accessToken } = await register();
      const other = await register({
        username: 'other',
        email: 'o@example.com',
      });
      await http()
        .delete(`/api/v1/users/${other.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('requires a token', async () => {
      const { id } = await register();
      await http().delete(`/api/v1/users/${id}`).expect(401);
    });
  });
});
