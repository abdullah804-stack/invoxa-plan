import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { splitBackupForUpload } from '@invoxa/shared';
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
import { Document } from '../src/models/document.js';
import { Expense } from '../src/models/expense.js';

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

/**
 * Drafts written straight to the collection so a case about volume stays fast.
 * The API would otherwise number, log and re-read 2,000 rows one at a time.
 */
async function bulkDrafts(businessId: string, count: number, prefix: string): Promise<string[]> {
  const business = new Types.ObjectId(businessId);
  const uuids = Array.from(
    { length: count },
    (_, index) => `${prefix}-${index}-${randomSuffix()}` as string,
  );
  await Document.insertMany(
    uuids.map((clientUuid) => ({
      business,
      clientUuid,
      docType: 'invoice',
      status: 'draft',
      number: null,
      items: [],
      currency: 'USD',
    })),
  );
  return uuids;
}

describe('week 15: hardening', () => {
  let app: FastifyInstance;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(testApp.request, { businessName: 'Release Candidate Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('exports every document, not just the first 2,000', async () => {
    const uuids = await bulkDrafts(owner.businessId, 2_100, 'bulk');

    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));
    expect(exported.status).toBe(200);
    expect(exported.body.documents).toHaveLength(2_100);

    const exportedUuids = new Set(
      (exported.body.documents as { clientUuid: string }[]).map((row) => row.clientUuid),
    );
    expect(exportedUuids.has(uuids[0] as string)).toBe(true);
    expect(exportedUuids.has(uuids[2_099] as string)).toBe(true);
  });

  it('includes recurring schedules and restores them onto the copied invoice', async () => {
    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'Acme Studio', email: 'hello@acme.test' });
    expect(client.status).toBe(201);

    const draft = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `retainer-${randomSuffix()}`,
        docType: 'invoice',
        clientId: client.body.client.id,
        items: [{ description: 'Monthly retainer', quantity: 1, unitPrice: 90_000 }],
        currency: 'USD',
        taxRateBp: 1000,
      });
    expect(draft.status).toBe(201);

    const schedule = await testApp.request().post('/api/v1/recurring').set(headersFor(owner)).send({
      documentId: draft.body.document.id,
      interval: 'monthly',
      startDate: '2026-12-01',
      dueDays: 10,
    });
    expect(schedule.status).toBe(201);

    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));
    expect(exported.status).toBe(200);
    expect(exported.body.recurring).toHaveLength(1);
    expect(exported.body.recurring[0]).toMatchObject({
      sourceClientUuid: draft.body.document.clientUuid,
      interval: 'monthly',
      intervalCount: 1,
      startDate: '2026-12-01',
      dueDays: 10,
      active: true,
    });

    const secondId = await newBusiness(owner, 'Restored Retainer');
    const restore = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner, secondId))
      .send(exported.body);
    expect(restore.status).toBe(200);
    expect(restore.body.restored.recurring).toBe(1);

    const schedules = await testApp
      .request()
      .get('/api/v1/recurring')
      .set(headersFor(owner, secondId));
    const documents = await testApp
      .request()
      .get('/api/v1/invoices')
      .set(headersFor(owner, secondId));
    expect(schedules.body.schedules).toHaveLength(1);
    expect(documents.body.documents).toHaveLength(1);
    // The copy points at the restored invoice, not at the old database ID.
    expect(schedules.body.schedules[0].documentId).toBe(documents.body.documents[0].id);
    expect(documents.body.documents[0].clientUuid).toBe(draft.body.document.clientUuid);

    const again = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner, secondId))
      .send(exported.body);
    expect(again.body.restored.recurring).toBe(0);
    expect(again.body.skipped.recurring).toBe(1);
  });

  it('recognises an already-imported document past the first 2,000 rows', async () => {
    const uuids = await bulkDrafts(owner.businessId, 2_050, 'merge');
    const target = uuids[2_049] as string;
    const file = {
      version: 1,
      documents: [
        { clientUuid: target, docType: 'invoice', status: 'draft', items: [], currency: 'USD' },
      ],
    };

    const preview = await testApp
      .request()
      .post('/api/v1/backup/preview')
      .set(headersFor(owner))
      .send(file);
    expect(preview.status).toBe(200);
    expect(preview.body.existingDocuments).toBe(1);

    const restore = await testApp
      .request()
      .post('/api/v1/backup/restore')
      .set(headersFor(owner))
      .send(file);
    expect(restore.status).toBe(200);
    expect(restore.body.restored.documents).toBe(0);
    expect(restore.body.skipped.documents).toBe(1);
    expect(await Document.countDocuments({ business: new Types.ObjectId(owner.businessId) })).toBe(
      2_050,
    );
  });

  it('restores a backup larger than the 8 MB body limit by sending it in parts', async () => {
    const business = new Types.ObjectId(owner.businessId);
    const huge = Array.from({ length: 180 }, (_, index) => ({
      business,
      clientUuid: `huge-${index}-${randomSuffix()}`,
      docType: 'invoice',
      status: 'draft',
      number: null,
      currency: 'USD',
      items: Array.from({ length: 400 }, (_, line) => ({
        id: `line-${line}`,
        description: `Professional service line ${line} with a realistic description of the work`,
        quantity: 1,
        unitPrice: 1_000,
      })),
    }));
    await Document.insertMany(huge);

    const exported = await testApp.request().get('/api/v1/backup').set(headersFor(owner));
    expect(exported.status).toBe(200);
    const wholeBytes = Buffer.byteLength(JSON.stringify(exported.body), 'utf8');
    expect(wholeBytes).toBeGreaterThan(8 * 1024 * 1024);

    // Set BACKUP_FIXTURE_PATH to keep this file for the phone checklist's
    // large-restore check.
    const fixturePath = process.env['BACKUP_FIXTURE_PATH'];
    if (fixturePath) {
      await writeFile(fixturePath, JSON.stringify(exported.body), 'utf8');
    }

    // Each part has to fit the route's 8 MB body limit; the file as a whole does
    // not, which is exactly why the upload is split.
    const parts = splitBackupForUpload(exported.body, 6 * 1024 * 1024);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(Buffer.byteLength(JSON.stringify(part), 'utf8')).toBeLessThanOrEqual(6 * 1024 * 1024);
    }

    const secondId = await newBusiness(owner, 'Big Restore');
    let restoredDocuments = 0;
    for (const part of parts) {
      const restore = await testApp
        .request()
        .post('/api/v1/backup/restore')
        .set(headersFor(owner, secondId))
        .send(part);
      expect(restore.status).toBe(200);
      restoredDocuments += restore.body.restored.documents;
    }
    expect(restoredDocuments).toBe(huge.length);
    expect(await Document.countDocuments({ business: new Types.ObjectId(secondId) })).toBe(
      huge.length,
    );

    // One activity row for the whole restore, not one per part.
    const activity = await testApp
      .request()
      .get('/api/v1/activity')
      .set(headersFor(owner, secondId));
    const restoreRows = (activity.body.entries as { summary: string }[]).filter((entry) =>
      entry.summary.includes('Restored a backup'),
    );
    expect(restoreRows).toHaveLength(1);
    expect(restoreRows[0]?.summary).toContain(`${parts.length} parts`);
    // A 10 MB export and two restores need more than the default 30 s on CI.
  }, 120_000);

  it('accepts more than ten restore parts a minute', async () => {
    // A large backup arrives as many parts. Ten a minute used to fail a real
    // restore, so twelve small parts must all be accepted in one window.
    for (let index = 0; index < 12; index += 1) {
      const response = await testApp
        .request()
        .post('/api/v1/backup/restore')
        .set(headersFor(owner))
        .send({ version: 1, part: { index: 1, total: 1 } });
      expect(response.status, `part ${index + 1}`).toBe(200);
    }
  });

  it('answers 404, never 403, for another business resource on every later route', async () => {
    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'Owner Client' });
    const invoice = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `own-${randomSuffix()}`,
        docType: 'invoice',
        clientId: client.body.client.id,
        items: [{ description: 'Work', quantity: 1, unitPrice: 1_000 }],
        currency: 'USD',
      });
    const saved = await testApp
      .request()
      .post('/api/v1/saved-items')
      .set(headersFor(owner))
      .send({ description: 'Advice', unitPrice: 5_000, currency: 'USD' });
    const expense = await testApp.request().post('/api/v1/expenses').set(headersFor(owner)).send({
      date: '2026-11-01',
      category: 'software',
      description: 'Editor',
      amount: 1_200,
      currency: 'USD',
    });
    const project = await testApp
      .request()
      .post('/api/v1/projects')
      .set(headersFor(owner))
      .send({ name: 'Build', currency: 'USD', hourlyRateMinor: 5_000 });
    const time = await testApp.request().post('/api/v1/time-entries').set(headersFor(owner)).send({
      projectId: project.body.project.id,
      date: '2026-11-02',
      minutes: 60,
      description: 'Work',
      hourlyRateMinor: 5_000,
    });
    const schedule = await testApp
      .request()
      .post('/api/v1/recurring')
      .set(headersFor(owner))
      .send({ documentId: invoice.body.document.id, interval: 'monthly' });

    expect([
      client.status,
      invoice.status,
      saved.status,
      expense.status,
      project.status,
      time.status,
      schedule.status,
    ]).toEqual([201, 201, 201, 201, 201, 201, 201]);

    const stranger = await registerAccount(testApp.request, { businessName: 'Stranger Ltd' });

    const reads = [
      `/api/v1/clients/${client.body.client.id}`,
      `/api/v1/invoices/${invoice.body.document.id}`,
      `/api/v1/expenses/${expense.body.expense.id}`,
      `/api/v1/projects/${project.body.project.id}`,
      `/api/v1/time-entries/${time.body.entry.id}`,
      `/api/v1/recurring/${schedule.body.schedule.id}`,
    ];
    for (const path of reads) {
      const response = await testApp.request().get(path).set(headersFor(stranger));
      expect(response.status, path).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }

    const write = await testApp
      .request()
      .put(`/api/v1/expenses/${expense.body.expense.id}`)
      .set(headersFor(stranger))
      .send({ description: 'Hijacked' });
    expect(write.status).toBe(404);

    const remove = await testApp
      .request()
      .delete(`/api/v1/saved-items/${saved.body.savedItem.id}`)
      .set(headersFor(stranger));
    expect(remove.status).toBe(404);

    const entries = await testApp
      .request()
      .get('/api/v1/time-entries')
      .query({ projectId: project.body.project.id })
      .set(headersFor(stranger));
    expect(entries.status).toBe(200);
    expect(entries.body.entries).toHaveLength(0);

    // The tenant header is equally unforgeable: asking for the owner's business
    // as a non-member is a 404 before any data is read.
    for (const path of [
      '/api/v1/activity',
      '/api/v1/reminders',
      '/api/v1/backup',
      '/api/v1/members',
    ]) {
      const response = await testApp
        .request()
        .get(path)
        .set(headersFor(stranger, owner.businessId));
      expect(response.status, path).toBe(404);
    }
  });

  it('rate limits repeated sign-in attempts per minute', async () => {
    const limited = await makeApp({ rateLimits: { generalMax: 10_000, authMax: 2 } });

    const attempt = () =>
      limited
        .request()
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'definitely-not-the-password' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    await limited.app.close();
  });

  it('records a realistic invoice so the 512 MB capacity estimate is grounded', async () => {
    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'Size Check', email: 'size@check.test', address: '12 Long Street, Town' });

    const draft = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `size-${randomSuffix()}`,
        docType: 'invoice',
        clientId: client.body.client.id,
        items: Array.from({ length: 5 }, (_, index) => ({
          description: `Line ${index + 1} with a realistic description`,
          quantity: 2,
          unitPrice: 12_500,
        })),
        currency: 'USD',
        taxRateBp: 1000,
        notes: 'Thanks for your business',
      });
    const issued = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(owner))
      .send({});

    const storedDocument = await Document.findById(issued.body.document.id).lean();
    const documentBytes = Buffer.byteLength(JSON.stringify(storedDocument), 'utf8');

    const expense = await testApp.request().post('/api/v1/expenses').set(headersFor(owner)).send({
      date: '2026-11-01',
      category: 'software',
      description: 'Yearly editor licence',
      vendor: 'Example Software',
      amount: 24_900,
      currency: 'USD',
      taxMinor: 3_800,
    });
    const storedExpense = await Expense.findById(expense.body.expense.id).lean();
    const expenseBytes = Buffer.byteLength(JSON.stringify(storedExpense), 'utf8');

    // Printed so docs/limits.md can quote a measurement, not a guess.
    process.stdout.write(
      `[capacity] issued invoice with 5 lines ≈ ${documentBytes} bytes; ` +
        `expense ≈ ${expenseBytes} bytes; ` +
        `512 MB ≈ ${Math.floor((512 * 1024 * 1024) / documentBytes)} invoices\n`,
    );

    expect(documentBytes).toBeLessThan(4_096);
    expect(expenseBytes).toBeLessThan(2_048);
  });
});
