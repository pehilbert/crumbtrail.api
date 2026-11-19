import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types.js';

/**
 * Checks the OpenAPI document and keeps docs/openapi.json (the reference for
 * API consumers) in sync with the code. When this fails because the document
 * changed, regenerate it with `npm run openapi` and commit the result.
 */
describe('OpenAPI document (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  let document: any;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('crumbtrail-e2e');

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication()) as typeof app;
    await app.init();

    document = (await http().get('/api/docs-json').expect(200)).body;
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('serves the Swagger UI without auth', async () => {
    const res = await http().get('/api/docs').redirects(1).expect(200);
    expect(res.text).toContain('swagger');
  });

  it('documents every route under its versioned path', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
      '/api/v1/journals/{id}',
      '/api/v1/recipes',
      '/api/v1/recipes/me',
      '/api/v1/recipes/{id}',
      '/api/v1/recipes/{recipeId}/journals',
      '/api/v1/users',
      '/api/v1/users/me',
      '/api/v1/users/{id}',
    ]);
  });

  it('requires the bearer token by default and none on public routes', () => {
    expect(document.security).toEqual([{ bearer: [] }]);
    expect(document.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(document.paths['/api/v1/recipes/{id}'].get.security).toEqual([]);
    expect(document.paths['/api/v1/auth/login'].post.security).toEqual([]);
    expect(
      document.paths['/api/v1/recipes/{id}'].patch.security,
    ).toBeUndefined();
    expect(JSON.stringify(document)).not.toContain('x-public');
  });

  it('documents the refresh cookie on the session endpoints', () => {
    expect(document.components.securitySchemes.refreshCookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'crumbtrail_refresh',
    });
    for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      expect(document.paths[path].post.security).toEqual([
        { refreshCookie: [] },
      ]);
    }
    for (const [path, status] of [
      ['/api/v1/auth/login', '200'],
      ['/api/v1/users', '201'],
      ['/api/v1/auth/refresh', '200'],
      ['/api/v1/auth/logout', '204'],
    ]) {
      expect(
        document.paths[path].post.responses[status].headers,
      ).toHaveProperty('Set-Cookie');
    }
  });

  it('derives request bodies and path params from the Zod schemas', () => {
    const create = document.paths['/api/v1/recipes'].post;
    expect(create.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateRecipeRequest',
    });
    const body = document.components.schemas.CreateRecipeRequest;
    expect(body.required).toEqual(
      expect.arrayContaining(['title', 'ingredients', 'steps']),
    );
    expect(body.additionalProperties).toBe(false);

    const params = document.paths['/api/v1/recipes/{id}'].get.parameters;
    expect(params).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
  });

  it('documents responses with named schemas', () => {
    const get = document.paths['/api/v1/recipes/{id}'].get;
    expect(Object.keys(get.responses).sort()).toEqual(['200', '400', '404']);
    expect(document.components.schemas).toHaveProperty('Recipe');
    expect(document.components.schemas).toHaveProperty('JournalEntry');
    expect(document.components.schemas).toHaveProperty('ErrorResponse');
  });

  it('matches the committed docs/openapi.json', async () => {
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot(
      '../../docs/openapi.json',
    );
  });
});
