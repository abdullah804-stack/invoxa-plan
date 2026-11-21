import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
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
import { Membership } from '../src/models/membership.js';
import { scoped } from '../src/scoped.js';
import type { TenantContext } from '../src/tenant.js';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('business scoping and ownership', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let alice: TestAccount;
  let bob: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    alice = await registerAccount(testApp.request, {
      name: 'Alice Owner',
      businessName: 'Alice Design',
    });
    bob = await registerAccount(testApp.request, {
      name: 'Bob Owner',
      businessName: 'Bob Builders',
    });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('returns only the caller business when X-Business-Id is absent', async () => {
    const response = await testApp.request().get('/api/v1/profile').set(headersFor(alice));

    expect(response.status).toBe(200);
    expect(response.body.business.name).toBe('Alice Design');
  });

  it('returns 404 when another business is requested by header', async () => {
    const response = await testApp
      .request()
      .get('/api/v1/profile')
      .set(headersFor(alice, bob.businessId));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(response.body)).not.toContain('Bob Builders');
  });

  it('refuses to let A change B business details', async () => {
    const response = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(alice, bob.businessId))
      .send({ name: 'Hijacked Ltd' });

    expect(response.status).toBe(404);

    const bobProfile = await testApp.request().get('/api/v1/profile').set(headersFor(bob));
    expect(bobProfile.body.business.name).toBe('Bob Builders');
  });

  it('refuses a logo upload aimed at another business', async () => {
    const response = await testApp
      .request()
      .put('/api/v1/profile/logo')
      .set(headersFor(alice, bob.businessId))
      .send({ dataUrl: PNG_DATA_URL });

    expect(response.status).toBe(404);
    expect(await BrandAsset.countDocuments()).toBe(0);
  });

  it('treats a malformed business id as not found, not a server error', async () => {
    const response = await testApp
      .request()
      .get('/api/v1/profile')
      .set(headersFor(alice, 'not-an-object-id'));

    expect(response.status).toBe(404);
  });

  it('gives viewer and staff roles no owner permissions', async () => {
    const viewer = await registerAccount(testApp.request, { businessName: 'Viewer Co' });
    const staff = await registerAccount(testApp.request, { businessName: 'Staff Co' });

    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(alice.businessId),
      role: 'viewer',
    });
    await Membership.create({
      userId: new Types.ObjectId(staff.userId),
      business: new Types.ObjectId(alice.businessId),
      role: 'staff',
    });

    const viewerRead = await testApp
      .request()
      .get('/api/v1/profile')
      .set(headersFor(viewer, alice.businessId));
    expect(viewerRead.status).toBe(200);

    const viewerWrite = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(viewer, alice.businessId))
      .send({ name: 'Viewer Was Here' });
    expect(viewerWrite.status).toBe(403);
    expect(viewerWrite.body.error.code).toBe('FORBIDDEN');

    const staffWrite = await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(staff, alice.businessId))
      .send({ name: 'Staff Was Here' });
    expect(staffWrite.status).toBe(403);
  });

  it('scoped queries never return another business records', async () => {
    const aliceAsset = await BrandAsset.create({
      business: new Types.ObjectId(alice.businessId),
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      dataUrl: PNG_DATA_URL,
      size: 68,
    });
    await BrandAsset.create({
      business: new Types.ObjectId(bob.businessId),
      sha256: 'b'.repeat(64),
      mime: 'image/png',
      dataUrl: PNG_DATA_URL,
      size: 68,
    });

    const aliceContext: TenantContext = {
      userId: alice.userId,
      businessId: alice.businessId,
      role: 'owner',
      membershipId: 'membership',
    };

    const repository = scoped(BrandAsset, aliceContext);
    const visible = await repository.find();
    expect(visible).toHaveLength(1);
    expect(String(visible[0]?._id)).toBe(String(aliceAsset._id));
    expect(await repository.count()).toBe(1);

    const foreign = await repository.findById(
      String((await BrandAsset.findOne({ sha256: 'b'.repeat(64) }))?._id),
    );
    expect(foreign).toBeNull();
  });
});
