import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, type TestApp } from './helpers.js';

describe('health and the central error shape', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await makeApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the health check with no auth and no database call', async () => {
    const response = await testApp.request().get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'invoxa-api' });
  });

  it('returns a request id so a report can be matched to the logs', async () => {
    const response = await testApp.request().get('/api/v1/health');

    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns NOT_FOUND in the standard shape for an unknown route', async () => {
    const response = await testApp.request().get('/api/v1/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toBeTruthy();
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it('sets helmet headers', async () => {
    const response = await testApp.request().get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('allows a configured CORS origin only', async () => {
    const allowed = await testApp
      .request()
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:8081');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8081');

    const denied = await testApp
      .request()
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
