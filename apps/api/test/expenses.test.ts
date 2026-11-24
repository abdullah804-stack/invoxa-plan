import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { addMonthsClamped } from '@invoxa/shared';
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
  account: TestAccount,
  overrides: Record<string, unknown> = {},
) {
  return testApp
    .request()
    .post('/api/v1/expenses')
    .set(headersFor(account))
    .send({
      date: today(),
      category: 'software',
      description: 'Design tool',
      amount: 2400,
      currency: 'USD',
      ...overrides,
    });
}

describe('expenses', () => {
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
    owner = await registerAccount(testApp.request, { businessName: 'Expense Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('creates an expense and totals it per currency', async () => {
    const first = await addExpense(testApp, owner);
    expect(first.status).toBe(201);
    expect(first.body.expense).toMatchObject({
      category: 'software',
      description: 'Design tool',
      amount: 2400,
      currency: 'USD',
      vendor: null,
    });

    await addExpense(testApp, owner, {
      category: 'travel',
      description: 'Train to client',
      amount: 5000,
      taxMinor: 500,
      vendor: 'Rail Co',
    });
    await addExpense(testApp, owner, {
      category: 'meals',
      description: 'Lunch',
      amount: 1000,
      currency: 'EUR',
    });

    const list = await testApp.request().get('/api/v1/expenses').set(headersFor(owner));
    expect(list.status).toBe(200);
    expect(list.body.expenses).toHaveLength(3);
    expect(list.body.totals).toEqual([
      { currency: 'EUR', amount: 1000, count: 1 },
      { currency: 'USD', amount: 7400, count: 2 },
    ]);
    expect(list.body.month.totals).toEqual(list.body.totals);
    expect(list.body.month.from.endsWith('-01')).toBe(true);
  });

  it('filters by category and date, and excludes older months from the month total', async () => {
    await addExpense(testApp, owner, { category: 'software', amount: 1000 });
    await addExpense(testApp, owner, { category: 'travel', amount: 2000 });
    const lastMonth = addMonthsClamped(today(), -1);
    await addExpense(testApp, owner, {
      category: 'software',
      amount: 3000,
      date: lastMonth,
    });

    const travel = await testApp
      .request()
      .get('/api/v1/expenses?category=travel')
      .set(headersFor(owner));
    expect(travel.body.expenses).toHaveLength(1);
    expect(travel.body.totals).toEqual([{ currency: 'USD', amount: 2000, count: 1 }]);

    const recent = await testApp
      .request()
      .get(`/api/v1/expenses?from=${today()}`)
      .set(headersFor(owner));
    expect(recent.body.expenses).toHaveLength(2);
    expect(recent.body.totals).toEqual([{ currency: 'USD', amount: 3000, count: 2 }]);

    const all = await testApp.request().get('/api/v1/expenses').set(headersFor(owner));
    expect(all.body.totals).toEqual([{ currency: 'USD', amount: 6000, count: 3 }]);
    // The month card does not count last month's software.
    expect(all.body.month.totals).toEqual([{ currency: 'USD', amount: 3000, count: 2 }]);
  });

  it('updates and deletes an expense', async () => {
    const created = await addExpense(testApp, owner);
    const id = created.body.expense.id as string;

    const updated = await testApp
      .request()
      .put(`/api/v1/expenses/${id}`)
      .set(headersFor(owner))
      .send({ amount: 3000, vendor: 'Figma' });
    expect(updated.status).toBe(200);
    expect(updated.body.expense).toMatchObject({ amount: 3000, vendor: 'Figma' });

    const single = await testApp.request().get(`/api/v1/expenses/${id}`).set(headersFor(owner));
    expect(single.status).toBe(200);

    const removed = await testApp.request().delete(`/api/v1/expenses/${id}`).set(headersFor(owner));
    expect(removed.status).toBe(204);

    const after = await testApp.request().get(`/api/v1/expenses/${id}`).set(headersFor(owner));
    expect(after.status).toBe(404);
  });

  it('lets a viewer read but not write', async () => {
    const viewer = await registerAccount(testApp.request, {
      businessName: 'Viewer Expenses',
      email: `viewer-${randomSuffix()}@example.com`,
    });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });

    const read = await testApp
      .request()
      .get('/api/v1/expenses')
      .set(headersFor(viewer, owner.businessId));
    expect(read.status).toBe(200);

    const write = await testApp
      .request()
      .post('/api/v1/expenses')
      .set(headersFor(viewer, owner.businessId))
      .send({
        date: today(),
        category: 'fees',
        description: 'Bank fee',
        amount: 500,
        currency: 'USD',
      });
    expect(write.status).toBe(403);
  });

  it('keeps expenses inside their business and rejects bad amounts', async () => {
    const created = await addExpense(testApp, owner);
    const id = created.body.expense.id as string;

    const other = await registerAccount(testApp.request, { businessName: 'Other Expenses' });
    const foreign = await testApp.request().get(`/api/v1/expenses/${id}`).set(headersFor(other));
    expect(foreign.status).toBe(404);

    const invalid = await addExpense(testApp, owner, { amount: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details[0].path).toBe('amount');

    const missing = await addExpense(testApp, owner, { category: 'rent' });
    expect(missing.status).toBe(400);
  });
});
