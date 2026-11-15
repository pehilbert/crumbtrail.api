import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';

const COOKIE = 'crumbtrail_refresh';
const FRONTEND = 'http://localhost:4200'; // CORS_ORIGINS in vitest.config.e2e.ts

const newUser = {
  username: 'johnny123',
  password: 'password123',
  email: 'johnnyboy@example.com',
  firstName: 'John',
  lastName: 'Smith',
};
const credentials = { login: 'johnny123', password: 'password123' };

/** The refresh cookie a response set, with its attributes. */
function refreshCookie(res: request.Response): {
  value: string;
  attributes: string[];
} {
  const header = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((cookie) => cookie.startsWith(`${COOKIE}=`));
  expect(header, 'expected a refresh Set-Cookie header').toBeDefined();
  const [pair, ...attributes] = header!.split(';').map((part) => part.trim());
  return { value: pair.slice(COOKIE.length + 1), attributes };
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Sessions: refresh tokens, logout, CORS (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication<App>;
  let connection: Connection;

  const http = () => request(app.getHttpServer());
  const tokens = () => connection.collection('refreshTokens');

  const refresh = (token?: string) => {
    const req = http().post('/api/v1/auth/refresh');
    return token ? req.set('Cookie', `${COOKIE}=${token}`) : req;
  };

  async function login() {
    const res = await http()
      .post('/api/v1/auth/login')
      .send(credentials)
      .expect(200);
    return {
      id: res.body.id as string,
      refreshToken: refreshCookie(res).value,
    };
  }

  async function register() {
    const res = await http().post('/api/v1/users').send(newUser).expect(201);
    return {
      id: res.body.id as string,
      accessToken: res.body.accessToken as string,
      refreshToken: refreshCookie(res).value,
    };
  }

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
    connection = app.get<Connection>(getConnectionToken());
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'refreshTokens'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  describe('signing in', () => {
    it('sets an httpOnly refresh cookie scoped to the auth endpoints on login', async () => {
      await register();
      const res = await http()
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'id']);

      const { value, attributes } = refreshCookie(res);
      expect(value).toMatch(/^[\w-]{43}$/);
      expect(attributes).toEqual(
        expect.arrayContaining([
          'Path=/api/v1/auth',
          'HttpOnly',
          'Secure',
          'SameSite=Strict',
          `Max-Age=${30 * 24 * 60 * 60}`,
        ]),
      );
    });

    it('sets the cookie on registration and stores only a hash of the token', async () => {
      const { id, refreshToken } = await register();
      const records = await tokens().find({ userId: id }).toArray();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        tokenHash: sha256(refreshToken),
        spentAt: null,
      });
      expect(JSON.stringify(records)).not.toContain(refreshToken);
    });

    it('starts a separate session for each login', async () => {
      await register();
      await login();
      const sessionIds = await tokens().distinct('sessionId');
      expect(sessionIds).toHaveLength(2);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns a working access token and rotates the cookie', async () => {
      const { id, refreshToken } = await register();

      const res = await refresh(refreshToken).expect(200);
      expect(res.body).toEqual({ id, accessToken: expect.any(String) });
      const next = refreshCookie(res).value;
      expect(next).not.toBe(refreshToken);

      await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      const old = await tokens().findOne({ tokenHash: sha256(refreshToken) });
      const successor = await tokens().findOne({ tokenHash: sha256(next) });
      expect(old?.spentAt).toBeInstanceOf(Date);
      expect(successor).toMatchObject({
        sessionId: old?.sessionId,
        spentAt: null,
      });

      // The successor keeps rotating.
      await refresh(next).expect(200);
    });

    it('rejects a missing cookie with 401 and clears it', async () => {
      const res = await refresh().expect(401);
      expect(refreshCookie(res)).toMatchObject({ value: '' });
      expect(refreshCookie(res).attributes).toContain('Path=/api/v1/auth');
    });

    it('rejects an unknown token with 401', async () => {
      await register();
      await refresh('not-a-real-token').expect(401);
    });

    it('rejects an expired token with 401', async () => {
      const { refreshToken } = await register();
      await tokens().updateOne(
        { tokenHash: sha256(refreshToken) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
      await refresh(refreshToken).expect(401);
    });

    it('treats reuse of a spent token as theft and ends the session', async () => {
      const { refreshToken } = await register();
      const next = refreshCookie(await refresh(refreshToken).expect(200)).value;
      // Move the spend outside the 10 second grace window.
      await tokens().updateOne(
        { tokenHash: sha256(refreshToken) },
        { $set: { spentAt: new Date(Date.now() - 11_000) } },
      );

      const res = await refresh(refreshToken).expect(401);
      expect(refreshCookie(res).value).toBe('');
      // The thief's or the user's newer token is gone too.
      await refresh(next).expect(401);
      expect(await tokens().countDocuments()).toBe(0);
    });

    it('lets a concurrent refresh within the grace window succeed', async () => {
      const { refreshToken } = await register();
      const first = refreshCookie(
        await refresh(refreshToken).expect(200),
      ).value;
      const second = refreshCookie(
        await refresh(refreshToken).expect(200),
      ).value;

      expect(second).not.toBe(first);
      await refresh(first).expect(200);
      await refresh(second).expect(200);
    });

    it('only lets one of two simultaneous requests spend a token', async () => {
      const { refreshToken } = await register();
      const results = await Promise.all([
        refresh(refreshToken),
        refresh(refreshToken),
      ]);
      // Both succeed (grace window), each with its own successor.
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(new Set(results.map((r) => refreshCookie(r).value)).size).toBe(2);
      const old = await tokens().findOne({ tokenHash: sha256(refreshToken) });
      expect(old?.spentAt).toBeInstanceOf(Date);
    });

    it('rejects the token of a user deactivated by other means with 401', async () => {
      const { id, refreshToken } = await register();
      await connection
        .collection('users')
        .updateOne({ _id: id as any }, { $set: { active: false } });
      await refresh(refreshToken).expect(401);
      expect(await tokens().countDocuments({ userId: id })).toBe(0);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('ends that session only and clears the cookie', async () => {
      const { refreshToken } = await register();
      const other = await login();

      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `${COOKIE}=${refreshToken}`)
        .expect(204);
      expect(res.text).toBe('');
      expect(refreshCookie(res).value).toBe('');

      await refresh(refreshToken).expect(401);
      await refresh(other.refreshToken).expect(200);
    });

    it('succeeds without a cookie, or with an invalid one', async () => {
      await http().post('/api/v1/auth/logout').expect(204);
      await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `${COOKIE}=nonsense`)
        .expect(204);
    });
  });

  describe('deactivation', () => {
    it('ends every session and clears the cookie', async () => {
      const { id, accessToken, refreshToken } = await register();
      const other = await login();

      const res = await http()
        .delete(`/api/v1/users/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(refreshCookie(res).value).toBe('');

      await refresh(refreshToken).expect(401);
      await refresh(other.refreshToken).expect(401);
      expect(await tokens().countDocuments()).toBe(0);
    });
  });

  describe('CORS and cross-site requests', () => {
    it('allows the configured frontend origin with credentials', async () => {
      const res = await http()
        .options('/api/v1/auth/refresh')
        .set('Origin', FRONTEND)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not grant CORS to other origins', async () => {
      const res = await http()
        .options('/api/v1/auth/refresh')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('accepts state-changing requests from the frontend origin', async () => {
      await register();
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND)
        .set('Sec-Fetch-Site', 'same-site')
        .send(credentials)
        .expect(200);
    });

    it.each([
      ['Fetch Metadata', { 'Sec-Fetch-Site': 'cross-site' }],
      ['Origin only', {}],
    ])(
      'rejects state-changing requests from other origins with 403 (%s)',
      async (_label, headers) => {
        const { refreshToken } = await register();
        await refresh(refreshToken)
          .set('Origin', 'https://evil.example')
          .set(headers)
          .expect(403);
        // The token was not spent.
        await refresh(refreshToken).expect(200);
      },
    );

    it('still allows reads from any origin', async () => {
      const { id } = await register();
      await http()
        .get(`/api/v1/users/${id}`)
        .set('Origin', 'https://evil.example')
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(200);
    });
  });
});
