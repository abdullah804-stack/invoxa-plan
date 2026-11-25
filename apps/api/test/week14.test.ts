import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  randomSuffix,
  registerAccount,
  resetTestDb,
  type TestAccount,
  type TestApp,
} from './helpers.js';
import { AiUsage } from '../src/models/aiUsage.js';
import { Business } from '../src/models/business.js';
import { Client } from '../src/models/client.js';
import { Document } from '../src/models/document.js';
import { User } from '../src/models/user.js';

let testApp: TestApp;

async function newBusiness(owner: TestAccount, name: string): Promise<string> {
  const created = await testApp
    .request()
    .post('/api/v1/businesses')
    .set(headersFor(owner))
    .send({ name });
  expect(created.status).toBe(201);
  return created.body.business.id as string;
}

/** A client, an issued invoice with a discount, tax and one payment. */
async function seedInvoice(owner: TestAccount, businessId: string) {
  const client = await testApp
    .request()
    .post('/api/v1/clients')
    .set(headersFor(owner, businessId))
    .send({ name: 'Acme Studio', email: 'hello@acme.test' });
  expect(client.status).toBe(201);

  const draft = await testApp
    .request()
    .post('/api/v1/invoices')
    .set(headersFor(owner, businessId))
    .send({
      clientUuid: `backup-${randomSuffix()}`,
      docType: 'invoice',
      clientId: client.body.client.id,
      items: [
        { description: 'Design', quantity: 2, unitPrice: 40_000 },
        { description: 'Hosting', quantity: 1, unitPrice: 10_000 },
      ],
      currency: 'USD',
      discount: { type: 'percent', valueBp: 1000 },
      taxRateBp: 500,
      notes: 'Thanks',
    });
  expect(draft.status).toBe(201);

  const issued = await testApp
    .request()
    .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
    .set(headersFor(owner, businessId))
    .send({});
  expect(issued.status).toBe(200);

  const paid = await testApp
    .request()
    .post(`/api/v1/invoices/${draft.body.document.id}/payments`)
    .set(headersFor(owner, businessId))
    .send({ amount: 25_000, method: 'bank_transfer' });
  expect(paid.status).toBe(201);

  return { clientId: client.body.client.id as string, document: paid.body.document };
}

describe('week 14: backup, restore and account deletion', () => {
  let app: FastifyInstance;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(testApp.request, { businessName: 'Week Fourteen Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('restores a backup into a fresh business with identical totals', async () => {
    const original = await seedInvoice(owner, owner.businessId);
    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));
    expect(exported.status).toBe(200);
    expect(exported.body.version).toBe(1);
    expect(exported.body.clients).toHaveLength(1);
    expect(exported.body.documents).toHaveLength(1);
    expect(exported.body.documents[0].payments).toHaveLength(1);

    const secondId = await newBusiness(owner, 'Restored Shop');

    const preview = await testApp
      .request()
      .post('/api/v1/backup/preview')
      .set(headersFor(owner, secondId))
      .send(exported.body);
    expect(preview.status).toBe(200);
    expect(preview.body.counts).toMatchObject({ clients: 1, documents: 1 });
    expect(preview.body.existingDocuments).toBe(0);

    const restore = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner, secondId))
      .send(exported.body);
    expect(restore.status).toBe(200);
    expect(restore.body.restored).toMatchObject({ clients: 1, documents: 1 });
    expect(restore.body.skipped.documents).toBe(0);

    const documents = await testApp
      .request()
      .get('/api/v1/invoices')
      .set(headersFor(owner, secondId));
    expect(documents.body.documents).toHaveLength(1);
    const restored = documents.body.documents[0];

    expect(restored.totals).toEqual(original.document.totals);
    expect(restored.status).toBe('sent');
    expect(restored.clientName).toBe('Acme Studio');
    // A restored document starts a fresh, unique series in its new business.
    expect(restored.number).toBe('INV-0001');
    expect(restored.payments).toHaveLength(1);

    const activity = await testApp
      .request()
      .get('/api/v1/activity')
      .set(headersFor(owner, secondId));
    expect(activity.body.entries[0].summary).toContain('Restored a backup');
  });

  it('merges by clientUuid, so the same file restores nothing twice', async () => {
    await seedInvoice(owner, owner.businessId);
    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));

    const first = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner))
      .send(exported.body);
    expect(first.status).toBe(200);
    expect(first.body.restored.documents).toBe(0);
    expect(first.body.skipped.documents).toBe(1);

    const documents = await testApp.request().get('/api/v1/invoices').set(headersFor(owner));
    expect(documents.body.documents).toHaveLength(1);
  });

  it('refuses a malformed backup before writing anything', async () => {
    const brokenVersion = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner))
      .send({ version: 2, clients: [], documents: [] });
    expect(brokenVersion.status).toBe(400);

    const brokenRow = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner))
      .send({
        version: 1,
        clients: [{ name: 'Fine' }],
        documents: [{ clientUuid: 'x', docType: 'invoice', currency: 'USD', items: [] }],
      });
    expect(brokenRow.status).toBe(400);

    expect(await Client.countDocuments({})).toBe(0);
    expect(await Document.countDocuments({})).toBe(0);
  });

  it('lets only an owner export or restore, and never across businesses', async () => {
    const invite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'staff' });
    const staff = await registerAccount(testApp.request, { businessName: 'Staff Home' });
    await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(staff))
      .send({ code: invite.body.invite.code });

    const staffExport = await testApp
      .request()
      .get('/api/v1/backup')
      .set(headersFor(staff, owner.businessId));
    expect(staffExport.status).toBe(403);

    const stranger = await registerAccount(testApp.request, { businessName: 'Stranger Ltd' });
    const strangerExport = await testApp
      .request()
      .get('/api/v1/backup')
      .set(headersFor(stranger, owner.businessId));
    expect(strangerExport.status).toBe(404);
  });

  it('deletes an account and everything it solely owned', async () => {
    await seedInvoice(owner, owner.businessId);
    expect(await Business.countDocuments({})).toBe(1);
    expect(await Client.countDocuments({})).toBe(1);
    expect(await Document.countDocuments({})).toBe(1);

    const deleted = await testApp
      .request()
      .delete('/api/v1/auth/me')
      .set(headersFor(owner))
      .send({ password: owner.password });
    expect(deleted.status).toBe(204);

    expect(await User.countDocuments({})).toBe(0);
    expect(await Business.countDocuments({})).toBe(0);
    expect(await Client.countDocuments({})).toBe(0);
    expect(await Document.countDocuments({})).toBe(0);
    expect(await AiUsage.countDocuments({})).toBe(0);

    const after = await testApp.request().get('/api/v1/auth/me').set(headersFor(owner));
    expect(after.status).toBe(401);
  });

  it('will not delete an owner while someone else still works there', async () => {
    const invite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'staff' });
    const staff = await registerAccount(testApp.request, { businessName: 'Staff Home' });
    await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(staff))
      .send({ code: invite.body.invite.code });

    const blocked = await testApp
      .request()
      .delete('/api/v1/auth/me')
      .set(headersFor(owner))
      .send({ password: owner.password });
    expect(blocked.status).toBe(409);
    expect(await Business.countDocuments({ _id: owner.businessId })).toBe(1);
  });

  it('keeps AI usage rows for 30 days and the log capped per business', async () => {
    const indexes = await AiUsage.collection.indexes();
    const ttl = indexes.find((index) => index.key && 'updatedAt' in index.key);
    expect(ttl?.expireAfterSeconds).toBe(30 * 24 * 60 * 60);
  });

  it('exports the brand image and settings into the backup', async () => {
    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ name: 'Backed Up Ltd', currency: 'EUR', language: 'fr' });

    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));
    expect(exported.body.business).toMatchObject({
      name: 'Backed Up Ltd',
      currency: 'EUR',
      language: 'fr',
    });
    expect(exported.body.business.branding).toMatchObject({ color: '#1F5F4A' });
    expect(exported.body.business.branding.logoAssetId).toBeUndefined();

    const secondId = await newBusiness(owner, 'Second');
    const restore = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner, secondId))
      .send(exported.body);
    expect(restore.status).toBe(200);
    expect(restore.body.business).toMatchObject({
      name: 'Backed Up Ltd',
      currency: 'EUR',
      language: 'fr',
    });
  });
});
