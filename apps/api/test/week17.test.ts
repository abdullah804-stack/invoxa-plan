import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { addDays } from '@invoxa/shared';
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

let testApp: TestApp;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function geminiReply(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SeedOptions {
  clientId?: string;
  clientName?: string;
  issueDate?: string;
  dueDate?: string;
  unitPrice?: number;
  taxRateBp?: number;
  pay?: number;
}

async function seedInvoice(owner: TestAccount, options: SeedOptions = {}) {
  let clientId = options.clientId;
  if (!clientId) {
    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: options.clientName ?? 'Acme Studio', phone: '+1 555 0100' });
    expect(client.status).toBe(201);
    clientId = client.body.client.id as string;
  }

  const draft = await testApp
    .request()
    .post('/api/v1/invoices')
    .set(headersFor(owner))
    .send({
      clientUuid: `report-${randomSuffix()}`,
      docType: 'invoice',
      clientId,
      items: [{ description: 'Design', quantity: 1, unitPrice: options.unitPrice ?? 100_000 }],
      currency: 'USD',
      taxRateBp: options.taxRateBp ?? 0,
      ...(options.issueDate ? { issueDate: options.issueDate } : {}),
      ...(options.dueDate ? { dueDate: options.dueDate } : {}),
    });
  expect(draft.status).toBe(201);

  const issued = await testApp
    .request()
    .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
    .set(headersFor(owner))
    .send(options.issueDate ? { issueDate: options.issueDate } : {});
  expect(issued.status).toBe(200);

  if (options.pay) {
    const paid = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/payments`)
      .set(headersFor(owner))
      .send({ amount: options.pay, method: 'bank_transfer' });
    expect(paid.status).toBe(201);
  }

  return {
    clientId,
    documentId: draft.body.document.id as string,
    document: issued.body.document,
  };
}

describe('week 17: reports, exports, receipts, QR, refine and offline sync', () => {
  let app: FastifyInstance;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp({ geminiApiKey: 'test-gemini-key', aiDailyLimit: 10 });
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    vi.unstubAllGlobals();
    owner = await registerAccount(testApp.request, { businessName: 'Reports Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('buckets unpaid invoices, reports sales and tax, and never mixes currencies', async () => {
    await seedInvoice(owner, {
      issueDate: addDays(today(), -40),
      dueDate: addDays(today(), -10),
      unitPrice: 100_000,
      taxRateBp: 1000,
      pay: 40_000,
    });
    await seedInvoice(owner, {
      issueDate: today(),
      dueDate: addDays(today(), 10),
      clientName: 'Beta Co',
      unitPrice: 50_000,
    });

    const aging = await testApp.request().get('/api/v1/reports/aging').set(headersFor(owner));
    expect(aging.status).toBe(200);
    const usd = aging.body.currencies[0];
    expect(usd.currency).toBe('USD');
    expect(usd.total).toBe(120_000);
    expect(usd.buckets.find((bucket: { key: string }) => bucket.key === '1-30').amount).toBe(
      70_000,
    );

    const cash = await testApp.request().get('/api/v1/reports/cash-flow').set(headersFor(owner));
    expect(cash.status).toBe(200);
    expect(cash.body.currencies[0]).toMatchObject({
      currency: 'USD',
      invoiced: 160_000,
      collected: 40_000,
      overdue: 70_000,
    });

    const byClient = await testApp
      .request()
      .get('/api/v1/reports/by-client')
      .query({ from: addDays(today(), -60), to: today() })
      .set(headersFor(owner));
    expect(byClient.status).toBe(200);
    expect(byClient.body.rows).toHaveLength(2);
    expect(byClient.body.totals[0]).toMatchObject({ currency: 'USD', invoiced: 160_000 });

    const tax = await testApp
      .request()
      .get('/api/v1/reports/tax')
      .query({ from: addDays(today(), -60), to: today() })
      .set(headersFor(owner));
    expect(tax.status).toBe(200);
    const month = tax.body.months[0];
    expect(month.currency).toBe('USD');
    expect(tax.body.months.reduce((sum: number, row: { tax: number }) => sum + row.tax, 0)).toBe(
      10_000,
    );
    expect(
      tax.body.months.reduce(
        (sum: number, row: { taxableBase: number }) => sum + row.taxableBase,
        0,
      ),
    ).toBe(150_000);
    expect(
      tax.body.quarters.reduce((sum: number, row: { documents: number }) => sum + row.documents, 0),
    ).toBe(2);
  });

  it('exports documents and expenses as a BOM CSV that Excel can open safely', async () => {
    await seedInvoice(owner, { clientName: 'Acme, Inc', unitPrice: 100_000, taxRateBp: 1000 });

    const documents = await testApp
      .request()
      .get('/api/v1/reports/export/documents.csv')
      .set(headersFor(owner));
    expect(documents.status).toBe(200);
    expect(documents.headers['content-type']).toContain('text/csv');
    expect(documents.text.startsWith('\uFEFF')).toBe(true);
    expect(documents.text).toContain('"Acme, Inc"');
    expect(documents.text).toContain('1100.00');
    expect(documents.text).toContain('INV-0001');

    const expense = await testApp.request().post('/api/v1/expenses').set(headersFor(owner)).send({
      date: today(),
      category: 'travel',
      description: '=Train fare',
      amount: 4_500,
      currency: 'USD',
    });
    expect(expense.status).toBe(201);

    const expenses = await testApp
      .request()
      .get('/api/v1/reports/export/expenses.csv')
      .set(headersFor(owner));
    expect(expenses.status).toBe(200);
    expect(expenses.text).toContain("'=Train fare");
    expect(expenses.text).toContain('Travel');
  });

  it('builds a statement with an opening balance for the period', async () => {
    const older = await seedInvoice(owner, {
      issueDate: addDays(today(), -20),
      dueDate: addDays(today(), -5),
      unitPrice: 80_000,
      pay: 30_000,
    });
    await seedInvoice(owner, {
      clientId: older.clientId,
      issueDate: today(),
      dueDate: addDays(today(), 14),
      unitPrice: 20_000,
    });

    const statement = await testApp
      .request()
      .get(`/api/v1/clients/${older.clientId}/statement`)
      .query({ from: today() })
      .set(headersFor(owner));

    expect(statement.status).toBe(200);
    expect(statement.body.client.name).toBe('Acme Studio');
    expect(statement.body.sections).toHaveLength(1);
    expect(statement.body.sections[0]).toMatchObject({
      currency: 'USD',
      openingBalance: 50_000,
      billed: 20_000,
      closingBalance: 70_000,
    });
    expect(statement.body.sections[0].rows).toHaveLength(1);
  });

  it('gives a receipt only after money was recorded', async () => {
    const unpaid = await seedInvoice(owner);
    const refused = await testApp
      .request()
      .get(`/api/v1/invoices/${unpaid.documentId}/receipt`)
      .set(headersFor(owner));
    expect(refused.status).toBe(409);

    const paid = await seedInvoice(owner, { pay: 40_000 });
    const receipt = await testApp
      .request()
      .get(`/api/v1/invoices/${paid.documentId}/receipt`)
      .set(headersFor(owner));
    expect(receipt.status).toBe(200);
    expect(receipt.body.paid).toBe(40_000);
    expect(receipt.body.document.payments).toHaveLength(1);
  });

  it('generates a payment QR from the stored https payment link', async () => {
    await testApp
      .request()
      .put('/api/v1/profile')
      .set(headersFor(owner))
      .send({ name: 'Reports Ltd', payment: { link: 'https://pay.example.com/inv-1' } });

    const seeded = await seedInvoice(owner);
    const single = await testApp
      .request()
      .get(`/api/v1/invoices/${seeded.documentId}`)
      .set(headersFor(owner));

    expect(single.status).toBe(200);
    expect(single.body.qr.size).toBeGreaterThanOrEqual(21);
    expect(single.body.qr.path).toMatch(/^[MmLlHhVvZz0-9.,\s-]+$/);
  });

  it('refines one field with the assistant and refunds a failed call', async () => {
    const fetchMock = vi.fn(async () =>
      geminiReply(JSON.stringify({ text: 'Design work, revised' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const refined = await testApp
      .request()
      .post('/api/v1/ai/refine')
      .set(headersFor(owner))
      .send({ text: 'design', tone: 'clearer' });
    expect(refined.status).toBe(200);
    expect(refined.body.text).toBe('Design work, revised');
    expect(refined.body.remaining).toBe(9);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 500 })),
    );
    const failed = await testApp
      .request()
      .post('/api/v1/ai/refine')
      .set(headersFor(owner))
      .send({ text: 'design', tone: 'shorter' });
    expect(failed.status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => geminiReply(JSON.stringify({ text: 'Design' }))),
    );
    const stillNine = await testApp
      .request()
      .post('/api/v1/ai/refine')
      .set(headersFor(owner))
      .send({ text: 'design', tone: 'shorter' });
    expect(stillNine.body.remaining).toBe(8);
  });

  it('syncs an offline draft once and flags a server change as a conflict', async () => {
    const clientUuid = `offline-${randomSuffix()}`;
    const payload = {
      invoices: [
        {
          document: {
            clientUuid,
            docType: 'invoice',
            items: [{ description: 'Site visit', quantity: 1, unitPrice: 30_000 }],
            currency: 'USD',
          },
        },
      ],
    };

    const first = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.results[0].status).toBe('created');
    const documentId = first.body.results[0].document.id as string;

    // The same queue entry sent twice must not duplicate the draft.
    const again = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send(payload);
    expect(again.body.results[0].status).toBe('updated');

    const list = await testApp.request().get('/api/v1/invoices').set(headersFor(owner));
    expect(list.body.documents).toHaveLength(1);

    // Another device edits the draft, then this queue entry arrives stale.
    const base = again.body.results[0].document.updatedAt as string;
    await testApp
      .request()
      .put(`/api/v1/invoices/${documentId}`)
      .set(headersFor(owner))
      .send({ notes: 'Edited elsewhere' });

    const stale = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({
        invoices: [
          {
            baseUpdatedAt: base,
            document: {
              clientUuid,
              docType: 'invoice',
              items: [{ description: 'Changed offline', quantity: 1, unitPrice: 99_000 }],
              currency: 'USD',
            },
          },
        ],
      });
    expect(stale.body.results[0].status).toBe('conflict');
    expect(stale.body.results[0].document.notes).toBe('Edited elsewhere');

    // One bad item does not stop the others.
    const mixed = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({
        invoices: [
          {
            document: {
              clientUuid,
              docType: 'estimate',
              items: [{ description: 'Wrong type', quantity: 1, unitPrice: 1 }],
              currency: 'USD',
            },
          },
          {
            document: {
              clientUuid: `offline-${randomSuffix()}`,
              docType: 'invoice',
              items: [{ description: 'New work', quantity: 1, unitPrice: 5_000 }],
              currency: 'USD',
            },
          },
        ],
      });
    expect(mixed.body.results[0].status).toBe('failed');
    expect(mixed.body.results[1].status).toBe('created');
  });

  it('keeps the phone copy when the user answers a sync conflict', async () => {
    const clientUuid = `offline-${randomSuffix()}`;
    const phoneCopy = {
      clientUuid,
      docType: 'invoice',
      items: [{ description: 'Phone copy', quantity: 1, unitPrice: 42_000 }],
      currency: 'USD',
    };

    const first = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({ invoices: [{ document: phoneCopy }] });
    expect(first.body.results[0].status).toBe('created');
    const documentId = first.body.results[0].document.id as string;
    const base = first.body.results[0].document.updatedAt as string;

    await testApp
      .request()
      .put(`/api/v1/invoices/${documentId}`)
      .set(headersFor(owner))
      .send({ notes: 'Changed elsewhere' });

    // The stale queue entry stays a conflict until the user answers it.
    const staleEntry = { baseUpdatedAt: base, document: phoneCopy };
    const stale = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({ invoices: [staleEntry] });
    expect(stale.body.results[0].status).toBe('conflict');

    // "Keep the phone copy" writes it over the server draft anyway.
    const kept = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({ invoices: [{ ...staleEntry, resolution: 'keep-mine' }] });
    expect(kept.body.results[0].status).toBe('updated');
    expect(kept.body.results[0].document.items[0].description).toBe('Phone copy');
    expect(kept.body.results[0].document.totals.total).toBe(42_000);

    // An issued document is history: the phone copy becomes a new draft instead.
    const issued = await testApp
      .request()
      .post(`/api/v1/invoices/${documentId}/issue`)
      .set(headersFor(owner))
      .send({});
    expect(issued.status).toBe(200);

    const copied = await testApp
      .request()
      .post('/api/v1/sync/invoices')
      .set(headersFor(owner))
      .send({ invoices: [{ document: phoneCopy, resolution: 'keep-mine' }] });
    expect(copied.body.results[0].status).toBe('created');
    expect(copied.body.results[0].document.id).not.toBe(documentId);
    expect(copied.body.results[0].document.number).toBeNull();

    const drafts = await testApp
      .request()
      .get('/api/v1/invoices?status=draft')
      .set(headersFor(owner));
    expect(drafts.body.documents).toHaveLength(1);
  });

  it('returns 404, never 403, for another business’s statement', async () => {
    const seeded = await seedInvoice(owner);
    const other = await registerAccount(testApp.request, { businessName: 'Other Ltd' });

    const response = await testApp
      .request()
      .get(`/api/v1/clients/${seeded.clientId}/statement`)
      .set(headersFor(other, owner.businessId));
    expect(response.status).toBe(404);
  });
});
