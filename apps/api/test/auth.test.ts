import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  registerAccount,
  resetTestDb,
  TEST_JWT_SECRET,
  randomSuffix,
  type TestApp,
} from './helpers.js';
import { Business } from '../src/models/business.js';
import { Membership } from '../src/models/membership.js';
import { User } from '../src/models/user.js';

describe('auth', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('registers a user, a business and an owner membership', async () => {
    const email = `owner-${randomSuffix()}@example.com`;
    const response = await testApp.request().post('/api/v1/auth/register').send({
      name: 'Ayesha Khan',
      email,
      password: 'correct-horse-battery',
      businessName: 'Khan Studio',
    });

    expect(response.status).toBe(201);
    expect(typeof response.body.token).toBe('string');
    expect(response.body.user).toMatchObject({ name: 'Ayesha Khan', email });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.business).toMatchObject({ name: 'Khan Studio', role: 'owner' });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const stored = await User.findOne({ email }).select('+passwordHash');
    expect(stored).not.toBeNull();
    // bcrypt hashes are never the plain password and use cost 12.
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    const memberships = await Membership.find({ userId: stored?._id });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe('owner');
    expect(await Business.countDocuments()).toBe(1);
  });

  it('names the business after the owner when no name is given', async () => {
    const account = await registerAccount(testApp.request, { name: 'Bilal Ahmed' });
    const response = await testApp.request().get('/api/v1/auth/me').set(headersFor(account));

    expect(response.body.businesses[0].name).toBe('Bilal Ahmed');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const account = await registerAccount(testApp.request);

    const response = await testApp.request().post('/api/v1/auth/register').send({
      name: 'Someone Else',
      email: account.email,
      password: 'another-password',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(await User.countDocuments()).toBe(1);
  });

  it('validates the password length with a field-level detail', async () => {
    const response = await testApp
      .request()
      .post('/api/v1/auth/register')
      .send({
        name: 'Short Pass',
        email: `short-${randomSuffix()}@example.com`,
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.details[0].path).toBe('password');
  });

  it('logs in and gives the same error for a wrong email and a wrong password', async () => {
    const account = await registerAccount(testApp.request);

    const ok = await testApp
      .request()
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');

    const wrongPassword = await testApp
      .request()
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'not-the-password' });
    const unknownEmail = await testApp
      .request()
      .post('/api/v1/auth/login')
      .send({ email: `ghost-${randomSuffix()}@example.com`, password: 'not-the-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('requires a token for /auth/me', async () => {
    const response = await testApp.request().get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered, malformed and expired token', async () => {
    const account = await registerAccount(testApp.request);

    const tampered = await testApp
      .request()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${account.token}tampered`);
    const malformed = await testApp
      .request()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-token');
    const noScheme = await testApp
      .request()
      .get('/api/v1/auth/me')
      .set('Authorization', account.token);

    expect(tampered.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(noScheme.status).toBe(401);

    const expired = jwt.sign({ sub: account.userId }, TEST_JWT_SECRET, { expiresIn: '-1s' });
    const expiredResponse = await testApp
      .request()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(expiredResponse.status).toBe(401);
  });

  it('never accepts a token signed with another secret', async () => {
    const account = await registerAccount(testApp.request);
    const forged = jwt.sign({ sub: account.userId }, 'a'.repeat(32), { expiresIn: '7d' });

    const response = await testApp
      .request()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
  });

  it('deletes an account only with the right password and removes what it owned', async () => {
    const account = await registerAccount(testApp.request);

    const wrong = await testApp
      .request()
      .delete('/api/v1/auth/me')
      .set(headersFor(account))
      .send({ password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(await User.countDocuments()).toBe(1);

    const deleted = await testApp
      .request()
      .delete('/api/v1/auth/me')
      .set(headersFor(account))
      .send({ password: account.password });
    expect(deleted.status).toBe(204);

    expect(await User.countDocuments()).toBe(0);
    expect(await Membership.countDocuments()).toBe(0);
    expect(await Business.countDocuments()).toBe(0);

    const after = await testApp.request().get('/api/v1/auth/me').set(headersFor(account));
    expect(after.status).toBe(401);
  });
});

describe('auth rate limits', () => {
  it('limits register and login per minute per IP', async () => {
    await connectTestDb();
    const limited = await makeApp({ rateLimits: { generalMax: 1000, authMax: 2 } });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await limited
        .request()
        .post('/api/v1/auth/login')
        .send({
          email: `nobody-${randomSuffix()}@example.com`,
          password: 'whatever-password',
        });
      expect(response.status).toBe(401);
    }

    const blocked = await limited
      .request()
      .post('/api/v1/auth/login')
      .send({
        email: `nobody-${randomSuffix()}@example.com`,
        password: 'whatever-password',
      });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    await limited.app.close();
    await closeTestDb();
  });
});
