import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  registerAccount,
  resetTestDb,
  type TestAccount,
  type TestApp,
} from './helpers.js';
import { BrandAsset } from '../src/models/brandAsset.js';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function bytesDataUrl(bytes: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** A PNG header followed by padding, used to test the size limit. */
function oversizedPng(totalBytes: number): Buffer {
  const buffer = Buffer.alloc(totalBytes, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  return buffer;
}

describe('brand assets', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let account: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    account = await registerAccount(testApp.request, { businessName: 'Asset Studio' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('stores a logo and returns it on the profile', async () => {
    const upload = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: PNG_DATA_URL });

    expect(upload.status).toBe(200);
    expect(upload.body.logo.mime).toBe('image/png');
    expect(upload.body.logo.size).toBeGreaterThan(0);
    expect(upload.body.logo.id).toBeTruthy();

    const profile = await testApp.request().get('/api/v1/profile').set(headersFor(account));
    expect(profile.body.logo.id).toBe(upload.body.logo.id);
    expect(profile.body.business.branding.logoAssetId).toBe(upload.body.logo.id);
  });

  it('stores identical bytes once, not once per upload', async () => {
    const first = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: PNG_DATA_URL });
    const second = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: PNG_DATA_URL });

    expect(second.body.logo.id).toBe(first.body.logo.id);
    expect(await BrandAsset.countDocuments()).toBe(1);
  });

  it('rejects a GIF and a mime type that does not match the bytes', async () => {
    const gif = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
    expect(gif.status).toBe(400);
    expect(gif.body.error.code).toBe('VALIDATION');

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const lying = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: bytesDataUrl(jpegBytes, 'image/png') });
    expect(lying.status).toBe(400);

    expect(await BrandAsset.countDocuments()).toBe(0);
  });

  it('rejects a logo over 300 KB', async () => {
    const response = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: bytesDataUrl(oversizedPng(320 * 1024)) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('allows a signature up to 100 KB but no larger', async () => {
    const ok = await testApp
      .request()
      .put('/api/v1/profile/signature')
      .set(headersFor(account))
      .send({ dataUrl: bytesDataUrl(oversizedPng(60 * 1024)) });
    expect(ok.status).toBe(200);

    const tooBig = await testApp
      .request()
      .put('/api/v1/profile/signature')
      .set(headersFor(account))
      .send({ dataUrl: bytesDataUrl(oversizedPng(140 * 1024)) });
    expect(tooBig.status).toBe(413);
  });

  it('clears a logo on delete', async () => {
    await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(account))
      .send({ dataUrl: PNG_DATA_URL });

    const response = await testApp
      .request()
      .delete('/api/v1/profile/logo')
      .set(headersFor(account));

    expect(response.status).toBe(200);
    expect(response.body.logo).toBeNull();

    const profile = await testApp.request().get('/api/v1/profile').set(headersFor(account));
    expect(profile.body.logo).toBeNull();
    expect(profile.body.business.branding.logoAssetId).toBeNull();
  });
});
