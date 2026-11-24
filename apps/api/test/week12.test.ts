import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
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
import { Membership } from '../src/models/membership.js';

const today = () => new Date().toISOString().slice(0, 10);

async function addExpense(
  testApp: TestApp,
  owner: TestAccount,
  overrides: Record<string, unknown> = {},
) {
  return testApp
    .request()
    .post('/api/v1/expenses')
    .set(headersFor(owner))
    .send({
      date: today(),
      category: 'supplies',
      description: 'Printer paper',
      amount: 4500,
      currency: 'USD',
      billable: true,
      ...overrides,
    });
}

describe('week 12: expenses onto invoices, timer and late fees', () => {
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
    owner = await registerAccount(testApp.request, { businessName: 'Week Twelve Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('puts a billable expense on a draft line and releases it when the draft goes', async () => {
    const expense = await addExpense(testApp, owner);
    expect(expense.status).toBe(201);
    expect(expense.body.expense).toMatchObject({ billable: true, billedDocumentId: null });

    const created = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `expense-${randomSuffix()}`,
        docType: 'invoice',
        items: [
          {
            description: 'Printer paper',
            quantity: 1,
            unitPrice: 4500,
            expenseIds: [expense.body.expense.id],
          },
        ],
        currency: 'USD',
      });

    expect(created.status).toBe(201);
    const draft = created.body.document;
    expect(draft.items[0].expenseIds).toEqual([expense.body.expense.id]);
    expect(draft.totals.total).toBe(4500);

    const unbilled = await testApp
      .request()
      .get('/api/v1/expenses?unbilled=true')
      .set(headersFor(owner));
    expect(unbilled.body.expenses).toHaveLength(0);

    const edit = await testApp
      .request()
      .put(`/api/v1/expenses/${expense.body.expense.id}`)
      .set(headersFor(owner))
      .send({ amount: 100 });
    expect(edit.status).toBe(409);

    const removed = await testApp
      .request()
      .delete(`/api/v1/invoices/${draft.id}`)
      .set(headersFor(owner));
    expect(removed.status).toBe(204);

    const released = await testApp
      .request()
      .get('/api/v1/expenses?unbilled=true')
      .set(headersFor(owner));
    expect(released.body.expenses).toHaveLength(1);
  });

  it('refuses a non-billable, foreign-currency or already-billed expense', async () => {
    const plain = await addExpense(testApp, owner, { billable: false, description: 'Coffee' });
    const notBillable = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `expense-${randomSuffix()}`,
        docType: 'invoice',
        items: [
          {
            description: 'Coffee',
            quantity: 1,
            unitPrice: 4500,
            expenseIds: [plain.body.expense.id],
          },
        ],
        currency: 'USD',
      });
    expect(notBillable.status).toBe(400);

    const billable = await addExpense(testApp, owner);
    const wrongCurrency = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `expense-${randomSuffix()}`,
        docType: 'invoice',
        items: [
          {
            description: 'Printer paper',
            quantity: 1,
            unitPrice: 4500,
            expenseIds: [billable.body.expense.id],
          },
        ],
        currency: 'EUR',
      });
    expect(wrongCurrency.status).toBe(400);

    const first = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `expense-${randomSuffix()}`,
        docType: 'invoice',
        items: [
          {
            description: 'Printer paper',
            quantity: 1,
            unitPrice: 4500,
            expenseIds: [billable.body.expense.id],
          },
        ],
        currency: 'USD',
      });
    expect(first.status).toBe(201);

    const second = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `expense-${randomSuffix()}`,
        docType: 'invoice',
        items: [
          {
            description: 'Printer paper',
            quantity: 1,
            unitPrice: 4500,
            expenseIds: [billable.body.expense.id],
          },
        ],
        currency: 'USD',
      });
    expect(second.status).toBe(409);
  });

  it('runs one timer per person and rounds the minutes it banks', async () => {
    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ timeRounding: '15' });

    const project = await testApp.request().post('/api/v1/projects').set(headersFor(owner)).send({
      name: 'Retainer',
      currency: 'USD',
      hourlyRateMinor: 6000,
    });
    const projectId = project.body.project.id as string;

    const start = await testApp
      .request()
      .post('/api/v1/timer/start')
      .set(headersFor(owner))
      .send({ projectId, description: 'Design work' });
    expect(start.status).toBe(201);
    expect(start.body.timer).toMatchObject({
      projectId,
      projectName: 'Retainer',
      elapsedMinutes: 0,
    });

    const again = await testApp
      .request()
      .post('/api/v1/timer/start')
      .set(headersFor(owner))
      .send({ projectId });
    expect(again.status).toBe(409);

    const stop = await testApp.request().post('/api/v1/timer/stop').set(headersFor(owner)).send({});
    expect(stop.status).toBe(200);
    expect(stop.body.minutes).toBe(15);
    expect(stop.body.entry).toMatchObject({
      projectId,
      minutes: 15,
      description: 'Design work',
      hourlyRateMinor: 6000,
      currency: 'USD',
    });

    const idle = await testApp.request().get('/api/v1/timer').set(headersFor(owner));
    expect(idle.body.timer).toBeNull();

    const entries = await testApp
      .request()
      .get(`/api/v1/time-entries?projectId=${projectId}`)
      .set(headersFor(owner));
    expect(entries.body.entries).toHaveLength(1);
  });

  it('adds one late fee from the business rule, never from the request', async () => {
    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ lateFee: { enabled: true, type: 'percent', value: 150, graceDays: 0 } });

    const draft = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `late-${randomSuffix()}`,
        docType: 'invoice',
        items: [{ description: 'Rebuild', quantity: 1, unitPrice: 132000 }],
        currency: 'USD',
      });
    const id = draft.body.document.id as string;

    const issued = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/issue`)
      .set(headersFor(owner))
      .send({ issueDate: '2020-01-01', dueDate: '2020-01-02' });
    expect(issued.status).toBe(200);

    const fee = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/late-fee`)
      .set(headersFor(owner))
      .send({ amount: 1 });
    expect(fee.status).toBe(200);
    expect(fee.body.amount).toBe(1980);
    expect(fee.body.document.totals.total).toBe(133980);
    expect(fee.body.document.adjustments[0]).toMatchObject({ type: 'late_fee', amount: 1980 });

    const twice = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/late-fee`)
      .set(headersFor(owner))
      .send({});
    expect(twice.status).toBe(409);

    const viewer = await registerAccount(testApp.request, {
      businessName: 'Late Fee Viewer',
      email: `viewer-${randomSuffix()}@example.com`,
    });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'staff',
    });
    const staff = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/late-fee`)
      .set(headersFor(viewer, owner.businessId))
      .send({});
    expect(staff.status).toBe(403);
  });

  it('does not add a late fee inside the grace period or when the rule is off', async () => {
    const draft = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `late-${randomSuffix()}`,
        docType: 'invoice',
        items: [{ description: 'Rebuild', quantity: 1, unitPrice: 132000 }],
        currency: 'USD',
      });
    const id = draft.body.document.id as string;
    await testApp
      .request()
      .post(`/api/v1/invoices/${id}/issue`)
      .set(headersFor(owner))
      .send({ issueDate: '2020-01-01', dueDate: '2020-01-02' });

    const off = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/late-fee`)
      .set(headersFor(owner))
      .send({});
    expect(off.status).toBe(400);

    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ lateFee: { enabled: true, type: 'percent', value: 150, graceDays: 3650 } });

    const grace = await testApp
      .request()
      .post(`/api/v1/invoices/${id}/late-fee`)
      .set(headersFor(owner))
      .send({});
    expect(grace.status).toBe(400);
  });

  it('reads a receipt photo once and never stores it', async () => {
    const scanApp = await makeApp({ geminiApiKey: 'test-gemini-key', aiDailyLimit: 5 });
    try {
      const account = await registerAccount(scanApp.request, { businessName: 'Scans Ltd' });
      const reply = JSON.stringify({
        vendor: 'Staples',
        date: '2026-11-20',
        description: 'Ink cartridges',
        category: 'supplies',
        amount: 42.5,
        tax: 3.5,
      });
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const image = `data:image/jpeg;base64,${'A'.repeat(200)}`;
      const response = await scanApp
        .request()
        .post('/api/v1/ai/scan-receipt')
        .set(headersFor(account))
        .send({ image });

      expect(response.status).toBe(200);
      expect(response.body.receipt).toEqual({
        vendor: 'Staples',
        date: '2026-11-20',
        description: 'Ink cartridges',
        category: 'supplies',
        amount: 4250,
        taxMinor: 350,
        currency: 'USD',
      });
      expect(response.body.remaining).toBe(4);

      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(String(call[1].body)) as {
        contents: { parts: { inline_data?: { mime_type: string; data: string } }[] }[];
      };
      expect(body.contents[0]?.parts[0]?.inline_data?.mime_type).toBe('image/jpeg');

      // No expense was created: the user must review the suggestion first.
      const expenses = await scanApp.request().get('/api/v1/expenses').set(headersFor(account));
      expect(expenses.body.expenses).toHaveLength(0);

      const bad = await scanApp
        .request()
        .post('/api/v1/ai/scan-receipt')
        .set(headersFor(account))
        .send({ image: 'not-an-image' });
      expect(bad.status).toBe(400);
    } finally {
      vi.unstubAllGlobals();
      await scanApp.app.close();
    }
  });

  it('reports expenses per category and currency', async () => {
    await addExpense(testApp, owner, { category: 'supplies', amount: 4500, currency: 'USD' });
    await addExpense(testApp, owner, { category: 'travel', amount: 12000, currency: 'USD' });
    await addExpense(testApp, owner, { category: 'travel', amount: 9000, currency: 'EUR' });

    const report = await testApp.request().get('/api/v1/reports/expenses').set(headersFor(owner));
    expect(report.status).toBe(200);
    expect(report.body.totals).toEqual([
      { currency: 'EUR', amount: 9000, count: 1 },
      { currency: 'USD', amount: 16500, count: 2 },
    ]);
    expect(report.body.categories).toContainEqual({
      category: 'supplies',
      currency: 'USD',
      amount: 4500,
      count: 1,
    });
    expect(report.body.categories).toHaveLength(3);
  });
});
