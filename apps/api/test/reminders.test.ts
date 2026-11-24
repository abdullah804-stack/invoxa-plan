import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addDays } from '@invoxa/shared';
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

const today = () => new Date().toISOString().slice(0, 10);

async function issuedInvoice(
  testApp: TestApp,
  account: TestAccount,
  options: { issueDate: string; dueDate: string; description?: string },
): Promise<string> {
  const draft = await testApp
    .request()
    .post('/api/v1/invoices')
    .set(headersFor(account))
    .send({
      clientUuid: `rem-${Math.random().toString(36).slice(2, 10)}-fixture`,
      docType: 'invoice',
      items: [{ description: options.description ?? 'Retainer', quantity: 1, unitPrice: 30000 }],
      currency: 'USD',
      issueDate: options.issueDate,
      dueDate: options.dueDate,
    });
  const id = draft.body.document.id as string;

  const issued = await testApp
    .request()
    .post(`/api/v1/invoices/${id}/issue`)
    .set(headersFor(account))
    .send({ issueDate: options.issueDate, dueDate: options.dueDate });
  if (issued.status !== 200) {
    throw new Error(`issue failed: ${issued.status} ${JSON.stringify(issued.body)}`);
  }
  return id;
}

describe('reminders', () => {
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
    owner = await registerAccount(testApp.request, { businessName: 'Remind Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('splits overdue from due-soon and leaves far or paid invoices out', async () => {
    const overdue = await issuedInvoice(testApp, owner, {
      issueDate: addDays(today(), -20),
      dueDate: addDays(today(), -5),
    });
    const dueSoon = await issuedInvoice(testApp, owner, {
      issueDate: addDays(today(), -5),
      dueDate: addDays(today(), 1),
    });
    await issuedInvoice(testApp, owner, {
      issueDate: today(),
      dueDate: addDays(today(), 10),
    });
    const paid = await issuedInvoice(testApp, owner, {
      issueDate: addDays(today(), -10),
      dueDate: addDays(today(), -2),
    });
    await testApp
      .request()
      .post(`/api/v1/invoices/${paid}/payments`)
      .set(headersFor(owner))
      .send({ amount: 30000, method: 'cash', paidAt: today() });

    const response = await testApp.request().get('/api/v1/reminders').set(headersFor(owner));

    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual({ enabled: true, hour: 9, daysBefore: 2 });
    expect(response.body.counts).toEqual({ overdue: 1, dueSoon: 1 });
    expect(response.body.overdue[0].id).toBe(overdue);
    expect(response.body.overdue[0].daysUntilDue).toBeLessThan(0);
    expect(response.body.dueSoon[0].id).toBe(dueSoon);
    expect(response.body.dueSoon[0].balance).toBe(30000);
  });

  it('uses the business warning window and does not count a draft', async () => {
    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ reminders: { enabled: true, hour: 8, daysBefore: 7 } });
    await issuedInvoice(testApp, owner, {
      issueDate: today(),
      dueDate: addDays(today(), 6),
    });
    await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `draft-${Math.random().toString(36).slice(2, 10)}-fixture`,
        docType: 'invoice',
        items: [{ description: 'Draft', quantity: 1, unitPrice: 1000 }],
        currency: 'USD',
        dueDate: today(),
      });

    const response = await testApp.request().get('/api/v1/reminders').set(headersFor(owner));
    expect(response.body.settings.daysBefore).toBe(7);
    expect(response.body.counts).toEqual({ overdue: 0, dueSoon: 1 });
  });

  it('lets a viewer read reminders but no one outside the business', async () => {
    const viewer = await registerAccount(testApp.request, { businessName: 'Viewer Remind' });
    const forbidden = await testApp
      .request()
      .get('/api/v1/reminders')
      .set(headersFor(viewer, owner.businessId));
    expect(forbidden.status).toBe(404);

    const own = await testApp.request().get('/api/v1/reminders').set(headersFor(viewer));
    expect(own.status).toBe(200);
  });
});
