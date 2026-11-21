import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  registerAccount,
  resetTestDb,
  type TestApp,
} from './helpers.js';
import { User } from '../src/models/user.js';

describe('validation and operator injection', () => {
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

  it('rejects a Mongo operator in the register email', async () => {
    await registerAccount(testApp.request, { email: 'victim@example.com' });

    const response = await testApp
      .request()
      .post('/api/v1/auth/register')
      .send({
        name: 'Injected',
        email: { $ne: null },
        password: 'long-enough-password',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    // Nothing was matched or created by an operator.
    expect(await User.countDocuments()).toBe(1);
  });

  it('rejects a Mongo operator in the login email', async () => {
    await registerAccount(testApp.request, { email: 'victim@example.com' });

    const response = await testApp
      .request()
      .post('/api/v1/auth/login')
      .send({
        email: { $gt: '' },
        password: 'guessing-a-password',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
  });

  it('strips $ and dotted keys from a nested body before validation', async () => {
    const account = await registerAccount(testApp.request);

    const response = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(account))
      .send({
        name: 'Clean Name',
        branding: { color: '#112233', $set: { color: '#ff0000' } },
        'nested.dotted': 'value',
        __proto__: { polluted: true },
      });

    expect(response.status).toBe(200);
    expect(response.body.business.name).toBe('Clean Name');
    expect(response.body.business.branding.color).toBe('#112233');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();

    const reread = await testApp.request().get('/api/v1/profile').set(headersFor(account));
    expect(reread.body.business.name).toBe('Clean Name');
  });

  it('rejects an invalid colour and a non-https payment link', async () => {
    const account = await registerAccount(testApp.request);

    const badColour = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(account))
      .send({ branding: { color: 'green' } });
    expect(badColour.status).toBe(400);
    expect(badColour.body.error.code).toBe('VALIDATION');

    const badLink = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(account))
      .send({ payment: { link: 'javascript:alert(1)' } });
    expect(badLink.status).toBe(400);
  });

  it('rejects a body larger than the 1 MB limit', async () => {
    const account = await registerAccount(testApp.request);

    const response = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(account))
      .send({ name: 'x'.repeat(1_200_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('requires a JSON body to be an object', async () => {
    const account = await registerAccount(testApp.request);

    const response = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(account))
      .send({ dueDays: -3 });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('dueDays');
  });
});
