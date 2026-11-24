import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { addDays, nextRunDate } from '@invoxa/shared';
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
import { Document } from '../src/models/document.js';
import { Membership } from '../src/models/membership.js';

const today = () => new Date().toISOString().slice(0, 10);

async function createInvoice(
  testApp: TestApp,
  account: TestAccount,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await testApp
    .request()
    .post('/api/v1/invoices')
    .set(headersFor(account))
    .send({
      clientUuid: `doc-${randomSuffix()}-fixture`,
      docType: 'invoice',
      items: [{ description: 'Monthly retainer', quantity: 1, unitPrice: 50000 }],
      currency: 'USD',
      ...overrides,
    });
  if (response.status !== 201) {
    throw new Error(`invoice failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.document.id as string;
}

async function repeat(
  testApp: TestApp,
  account: TestAccount,
  documentId: string,
  overrides: Record<string, unknown> = {},
) {
  return testApp
    .request()
    .post('/api/v1/recurring')
    .set(headersFor(account))
    .send({ documentId, interval: 'monthly', ...overrides });
}

describe('recurring invoices', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(testApp.request, { businessName: 'Repeat Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('creates a schedule from an invoice, copying its lines and client', async () => {
    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'Acme Trading' });
    const documentId = await createInvoice(testApp, owner, { clientId: client.body.client.id });

    const response = await repeat(testApp, owner, documentId);

    expect(response.status).toBe(201);
    expect(response.body.schedule).toMatchObject({
      documentId,
      clientName: 'Acme Trading',
      currency: 'USD',
      interval: 'monthly',
      intervalCount: 1,
      nextRunAt: today(),
      active: true,
    });
    expect(response.body.schedule.items).toHaveLength(1);
    expect(response.body.schedule.items[0].unitPrice).toBe(50000);
  });

  it('creates one draft per occurrence and advances the schedule', async () => {
    const documentId = await createInvoice(testApp, owner);
    const created = await repeat(testApp, owner, documentId);
    const scheduleId = created.body.schedule.id as string;

    const first = await testApp
      .request()
      .post('/api/v1/recurring/run')
      .set(headersFor(owner))
      .send({});

    expect(first.status).toBe(200);
    expect(first.body.created).toBe(1);

    const drafts = await Document.find({ source: 'recurring' });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.number).toBeNull();
    expect(drafts[0]?.status).toBe('draft');
    expect(drafts[0]?.issueDate).toBe(today());
    expect(drafts[0]?.dueDate).toBe(addDays(today(), 14));
    expect(drafts[0]?.totals?.total).toBe(50000);

    const schedule = await testApp
      .request()
      .get(`/api/v1/recurring/${scheduleId}`)
      .set(headersFor(owner));
    expect(schedule.body.schedule.nextRunAt).toBe(nextRunDate(today(), today(), 'monthly', 1));
    expect(schedule.body.schedule.lastRunAt).toBe(today());
    expect(schedule.body.schedule.lastDocumentId).toBe(String(drafts[0]?._id));

    // The same day, again: the occurrence already has a row, so nothing repeats.
    const second = await testApp
      .request()
      .post('/api/v1/recurring/run')
      .set(headersFor(owner))
      .send({});
    expect(second.body.created).toBe(0);
    expect(await Document.countDocuments({ source: 'recurring' })).toBe(1);
  });

  it('does not run a paused schedule', async () => {
    const documentId = await createInvoice(testApp, owner);
    const created = await repeat(testApp, owner, documentId);

    const paused = await testApp
      .request()
      .put(`/api/v1/recurring/${created.body.schedule.id}`)
      .set(headersFor(owner))
      .send({ active: false });
    expect(paused.status).toBe(200);
    expect(paused.body.schedule.active).toBe(false);

    const run = await testApp
      .request()
      .post('/api/v1/recurring/run')
      .set(headersFor(owner))
      .send({});
    expect(run.body.created).toBe(0);
    expect(await Document.countDocuments({ source: 'recurring' })).toBe(0);
  });

  it('lets the daily job run every business with the job secret', async () => {
    const job = await makeApp({ jobSecret: 'daily-job-secret' });
    try {
      const first = await registerAccount(job.request, { businessName: 'Job A' });
      const second = await registerAccount(job.request, { businessName: 'Job B' });
      const firstDoc = await createInvoice(job, first);
      const secondDoc = await createInvoice(job, second);
      await repeat(job, first, firstDoc);
      await repeat(job, second, secondDoc);

      // No token at all: the secret is the credential.
      const run = await job
        .request()
        .post('/api/v1/recurring/run')
        .set('x-job-secret', 'daily-job-secret')
        .send({});
      expect(run.status).toBe(200);
      expect(run.body.created).toBe(2);

      const wrong = await job
        .request()
        .post('/api/v1/recurring/run')
        .set('x-job-secret', 'not-the-secret')
        .send({});
      expect(wrong.status).toBe(401);
    } finally {
      await job.app.close();
    }
  });

  it('rejects estimates and viewers', async () => {
    const estimateId = await createInvoice(testApp, owner, { docType: 'estimate' });
    const rejected = await repeat(testApp, owner, estimateId);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.details[0].path).toBe('documentId');

    const viewer = await registerAccount(testApp.request, {
      businessName: 'Viewer Repeat',
      email: `viewer-${randomSuffix()}@example.com`,
    });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });
    const forbidden = await testApp
      .request()
      .post('/api/v1/recurring')
      .set(headersFor(viewer, owner.businessId))
      .send({ documentId: estimateId, interval: 'monthly' });
    expect(forbidden.status).toBe(403);
  });

  it('keeps schedules inside their business', async () => {
    const documentId = await createInvoice(testApp, owner);
    const created = await repeat(testApp, owner, documentId);

    const other = await registerAccount(testApp.request, { businessName: 'Other Ltd' });
    const response = await testApp
      .request()
      .get(`/api/v1/recurring/${created.body.schedule.id}`)
      .set(headersFor(other));

    expect(response.status).toBe(404);
  });
});
