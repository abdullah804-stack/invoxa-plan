import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import type supertest from 'supertest';
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

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function daysAfter(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

interface TestDocument {
  id: string;
  clientUuid: string;
  number: string | null;
  status: string;
  shownStatus: string;
  docType: string;
  notes?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  convertedFrom?: string | null;
  items: unknown[];
  brandSnapshot?: { businessName: string };
  totals: {
    subtotal: number;
    discount: number;
    base: number;
    tax: number;
    total: number;
    paid: number;
    balance: number;
  };
}

function draftBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clientUuid: `uuid-${randomSuffix()}`,
    docType: 'invoice',
    items: [{ description: 'Design work', quantity: 10, unitPrice: 12000 }],
    currency: 'USD',
    ...overrides,
  };
}

describe('documents, lifecycle and numbering', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let owner: TestAccount;
  let request: () => supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
    request = testApp.request;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(request, {
      name: 'Owner One',
      businessName: 'Studio One',
    });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  async function createDocument(
    body: Record<string, unknown> = draftBody(),
    account: TestAccount = owner,
  ) {
    const response = await request().post('/api/v1/invoices').set(headersFor(account)).send(body);
    expect(response.status).toBe(201);
    return response.body.document as TestDocument;
  }

  async function issueDocument(id: string, body: Record<string, unknown> = {}, account = owner) {
    const response = await request()
      .post(`/api/v1/invoices/${id}/issue`)
      .set(headersFor(account))
      .send(body);
    expect(response.status).toBe(200);
    return response.body.document as TestDocument;
  }

  async function createClient(name: string, account: TestAccount = owner) {
    const response = await request()
      .post('/api/v1/clients')
      .set(headersFor(account))
      .send({ name });
    expect(response.status).toBe(201);
    return response.body.client as { id: string };
  }

  it('creates a draft once for a repeated clientUuid', async () => {
    const body = draftBody();

    const first = await request().post('/api/v1/invoices').set(headersFor(owner)).send(body);
    const second = await request().post('/api/v1/invoices').set(headersFor(owner)).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.document.id).toBe(first.body.document.id);
    expect(await Document.countDocuments()).toBe(1);
    expect(first.body.document.number).toBeNull();
    expect(first.body.document.totals.total).toBe(120000);
  });

  it('rejects a due date before the issue date', async () => {
    const response = await request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send(draftBody({ issueDate: '2026-02-10', dueDate: '2026-02-01' }));

    expect(response.status).toBe(400);
  });

  it('issues a draft with a number, snapshots and a default due date', async () => {
    const draft = await createDocument();

    const issued = await issueDocument(String(draft.id));

    expect(issued.number).toBe('INV-0001');
    expect(issued.status).toBe('sent');
    expect(issued.issueDate).toBe(TODAY);
    expect(issued.dueDate).toBe(daysAfter(TODAY, 14));
    expect(issued.brandSnapshot?.businessName).toBe('Studio One');
    expect(issued.totals.total).toBe(120000);
  });

  it('numbers each series separately', async () => {
    const estimate = await createDocument(draftBody({ docType: 'estimate' }));
    const credit = await createDocument(draftBody({ docType: 'credit_note' }));
    const invoice = await createDocument();

    expect((await issueDocument(String(estimate.id))).number).toBe('EST-0001');
    expect((await issueDocument(String(credit.id))).number).toBe('CN-0001');
    expect((await issueDocument(String(invoice.id))).number).toBe('INV-0001');
  });

  it('gives 20 parallel issues 20 unique numbers', async () => {
    const drafts = await Promise.all(Array.from({ length: 20 }, () => createDocument(draftBody())));

    const issued = await Promise.all(
      drafts.map(async (draft) => {
        const response = await request()
          .post(`/api/v1/invoices/${String(draft.id)}/issue`)
          .set(headersFor(owner))
          .send({});
        return response;
      }),
    );

    expect(issued.every((response) => response.status === 200)).toBe(true);

    const numbers = issued.map((response) => response.body.document.number as string);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers.every((number) => /^INV-\d{4}$/.test(number))).toBe(true);
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `INV-${String(index + 1).padStart(4, '0')}`),
    );
  });

  it('locks an issued document but still allows notes, terms and the due date', async () => {
    const draft = await createDocument();
    const issued = await issueDocument(String(draft.id));

    const itemEdit = await request()
      .put(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(owner))
      .send({ items: [{ description: 'Changed', quantity: 1, unitPrice: 1 }] });
    expect(itemEdit.status).toBe(409);
    expect(itemEdit.body.error.code).toBe('CONFLICT');

    const clientEdit = await request()
      .put(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(owner))
      .send({ currency: 'EUR' });
    expect(clientEdit.status).toBe(409);

    const allowed = await request()
      .put(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(owner))
      .send({ notes: 'Thanks for your business', terms: 'Net 14' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.document.notes).toBe('Thanks for your business');

    const dueChange = await request()
      .put(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(owner))
      .send({ dueDate: daysAfter(TODAY, 30) });
    expect(dueChange.status).toBe(200);
    expect(dueChange.body.document.dueDate).toBe(daysAfter(TODAY, 30));
  });

  it('records partial payments, rejects overpayment and settles the balance', async () => {
    const draft = await createDocument(
      draftBody({
        taxRateBp: 1000,
        items: [{ description: 'Work', quantity: 10, unitPrice: 12000 }],
      }),
    );
    const issued = await issueDocument(String(draft.id));
    expect(issued.totals).toMatchObject({ subtotal: 120000, tax: 12000, total: 132000 });

    const partial = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/payments`)
      .set(headersFor(owner))
      .send({ amount: 32000, method: 'bank_transfer' });
    expect(partial.status).toBe(201);
    expect(partial.body.document.shownStatus).toBe('partial');
    expect(partial.body.document.totals.balance).toBe(100000);

    const tooMuch = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/payments`)
      .set(headersFor(owner))
      .send({ amount: 100001, method: 'cash' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe('VALIDATION');

    const rest = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/payments`)
      .set(headersFor(owner))
      .send({ amount: 100000, method: 'cash' });
    expect(rest.status).toBe(201);
    expect(rest.body.document.status).toBe('paid');
    expect(rest.body.document.shownStatus).toBe('paid');
    expect(rest.body.document.totals.balance).toBe(0);
    expect(rest.body.document.payments).toHaveLength(2);
  });

  it('marks paid, undoes to sent and voids owner-only', async () => {
    const staff = await registerAccount(request, { businessName: 'Staff Account' });
    await Membership.create({
      userId: new Types.ObjectId(staff.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'staff',
    });

    const draft = await createDocument();
    const issued = await issueDocument(String(draft.id));

    const staffIssues = await request()
      .post('/api/v1/invoices')
      .set(headersFor(staff, owner.businessId))
      .send(draftBody());
    expect(staffIssues.status).toBe(201);

    const marked = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/status`)
      .set(headersFor(owner))
      .send({ status: 'paid' });
    expect(marked.status).toBe(200);
    expect(marked.body.document.status).toBe('paid');
    expect(marked.body.document.totals.paid).toBe(120000);
    expect(marked.body.document.totals.balance).toBe(0);

    const undone = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/status`)
      .set(headersFor(owner))
      .send({ status: 'sent' });
    expect(undone.status).toBe(200);
    expect(undone.body.document.status).toBe('sent');
    expect(undone.body.document.totals.paid).toBe(0);

    const staffVoid = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/status`)
      .set(headersFor(staff, owner.businessId))
      .send({ status: 'void' });
    expect(staffVoid.status).toBe(403);

    const ownerVoid = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/status`)
      .set(headersFor(owner))
      .send({ status: 'void' });
    expect(ownerVoid.status).toBe(200);
    expect(ownerVoid.body.document.shownStatus).toBe('void');
  });

  it('duplicates a document as a new draft with no number', async () => {
    const draft = await createDocument();
    const issued = await issueDocument(String(draft.id));

    const response = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/duplicate`)
      .set(headersFor(owner))
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.document.status).toBe('draft');
    expect(response.body.document.number).toBeNull();
    expect(response.body.document.source).toBe('duplicate');
    expect(response.body.document.items).toHaveLength(1);
    expect(response.body.document.clientUuid).not.toBe(issued.clientUuid);
  });

  it('converts an estimate to an invoice draft that gets its own number', async () => {
    const estimate = await createDocument(draftBody({ docType: 'estimate' }));
    const issuedEstimate = await issueDocument(String(estimate.id));
    expect(issuedEstimate.number).toBe('EST-0001');

    const converted = await request()
      .post(`/api/v1/invoices/${String(estimate.id)}/convert`)
      .set(headersFor(owner))
      .send({});
    expect(converted.status).toBe(201);
    expect(converted.body.document.docType).toBe('invoice');
    expect(converted.body.document.status).toBe('draft');
    expect(converted.body.document.convertedFrom).toBe(estimate.id);

    const issuedInvoice = await issueDocument(String(converted.body.document.id));
    expect(issuedInvoice.number).toBe('INV-0001');
  });

  it('applies a credit note up to the invoice balance and keeps the remainder', async () => {
    const client = await createClient('Acme Ltd');
    const invoiceDraft = await createDocument(draftBody({ clientId: client.id, taxRateBp: 1000 }));
    const invoice = await issueDocument(String(invoiceDraft.id));

    const creditDraft = await createDocument(
      draftBody({
        docType: 'credit_note',
        clientId: client.id,
        items: [{ description: 'Credit', quantity: 1, unitPrice: 20000 }],
      }),
    );
    const credit = await issueDocument(String(creditDraft.id));
    expect(credit.number).toBe('CN-0001');

    const applied = await request()
      .post(`/api/v1/invoices/${String(invoice.id)}/apply-credit`)
      .set(headersFor(owner))
      .send({ creditNoteId: credit.id });

    expect(applied.status).toBe(200);
    expect(applied.body.creditNote.applied).toBe(20000);
    expect(applied.body.creditNote.remaining).toBe(0);
    expect(applied.body.document.totals.balance).toBe(112000);
    expect(applied.body.document.shownStatus).toBe('partial');

    const again = await request()
      .post(`/api/v1/invoices/${String(invoice.id)}/apply-credit`)
      .set(headersFor(owner))
      .send({ creditNoteId: credit.id });
    expect(again.status).toBe(409);

    // A larger credit note is capped at the invoice balance.
    const bigDraft = await createDocument(
      draftBody({
        docType: 'credit_note',
        clientId: client.id,
        items: [{ description: 'Credit', quantity: 1, unitPrice: 200000 }],
      }),
    );
    const bigCredit = await issueDocument(String(bigDraft.id));

    const capped = await request()
      .post(`/api/v1/invoices/${String(invoice.id)}/apply-credit`)
      .set(headersFor(owner))
      .send({ creditNoteId: bigCredit.id });

    expect(capped.status).toBe(200);
    expect(capped.body.creditNote.applied).toBe(112000);
    expect(capped.body.creditNote.remaining).toBe(88000);
    expect(capped.body.document.status).toBe('paid');
  });

  it('filters by derived status, search, type and pages with a cursor', async () => {
    const client = await createClient('Acme Ltd');

    const overdue = await createDocument(
      draftBody({ clientId: client.id, issueDate: '2020-01-01', dueDate: '2020-01-10' }),
    );
    await issueDocument(String(overdue.id), { issueDate: '2020-01-01' });

    for (let index = 0; index < 4; index += 1) {
      const draft = await createDocument(draftBody({ clientId: client.id }));
      await issueDocument(String(draft.id));
    }
    await createDocument(draftBody({ docType: 'estimate' }));

    const overdueList = await request()
      .get('/api/v1/invoices?status=overdue')
      .set(headersFor(owner));
    expect(overdueList.status).toBe(200);
    expect(overdueList.body.documents).toHaveLength(1);
    expect(overdueList.body.documents[0].number).toBe('INV-0001');
    expect(overdueList.body.documents[0].shownStatus).toBe('overdue');

    const search = await request().get('/api/v1/invoices?q=acme').set(headersFor(owner));
    expect(search.body.documents).toHaveLength(5);

    const numberSearch = await request().get('/api/v1/invoices?q=INV-0002').set(headersFor(owner));
    expect(numberSearch.body.documents).toHaveLength(1);

    const estimates = await request()
      .get('/api/v1/invoices?docType=estimate')
      .set(headersFor(owner));
    expect(estimates.body.documents).toHaveLength(1);
    expect(estimates.body.documents[0].docType).toBe('estimate');

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const response = await request()
        .get(`/api/v1/invoices?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        .set(headersFor(owner));
      expect(response.status).toBe(200);
      seen.push(...response.body.documents.map((doc: { id: string }) => doc.id));
      cursor = response.body.nextCursor as string | null;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  it('summarises billed, paid, outstanding and overdue per currency', async () => {
    const paidDraft = await createDocument(
      draftBody({
        taxRateBp: 1000,
        items: [{ description: 'Work', quantity: 10, unitPrice: 12000 }],
      }),
    );
    const paidInvoice = await issueDocument(String(paidDraft.id));
    await request()
      .post(`/api/v1/invoices/${String(paidInvoice.id)}/payments`)
      .set(headersFor(owner))
      .send({ amount: 32000, method: 'cash' });

    const overdueDraft = await createDocument(
      draftBody({
        issueDate: '2020-01-01',
        dueDate: '2020-01-10',
        items: [{ description: 'Old work', quantity: 1, unitPrice: 50000 }],
      }),
    );
    await issueDocument(String(overdueDraft.id), { issueDate: '2020-01-01' });

    await createDocument(draftBody({ docType: 'estimate' }));

    const response = await request().get('/api/v1/reports/summary').set(headersFor(owner));

    expect(response.status).toBe(200);
    expect(response.body.currencies).toEqual([
      { currency: 'USD', billed: 182000, paid: 32000, outstanding: 150000, overdue: 50000 },
    ]);
    expect(response.body.counts.draft).toBe(1);
    expect(response.body.counts.overdue).toBe(1);
    expect(response.body.dueSoon).toHaveLength(1);
    expect(response.body.dueSoon[0].totals.balance).toBe(100000);
    expect(response.body.recent.length).toBeGreaterThan(0);
  });

  it('keeps every document scoped to its business', async () => {
    const mallory = await registerAccount(request, { businessName: 'Mallory Corp' });
    const draft = await createDocument();
    const issued = await issueDocument(String(draft.id));

    const read = await request()
      .get(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(mallory, owner.businessId));
    expect(read.status).toBe(404);

    const readOwnHeader = await request()
      .get(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(mallory));
    expect(readOwnHeader.status).toBe(404);

    const issueForeign = await request()
      .post(`/api/v1/invoices/${String(draft.id)}/issue`)
      .set(headersFor(mallory))
      .send({});
    expect(issueForeign.status).toBe(404);

    const payForeign = await request()
      .post(`/api/v1/invoices/${String(issued.id)}/payments`)
      .set(headersFor(mallory))
      .send({ amount: 100, method: 'cash' });
    expect(payForeign.status).toBe(404);

    const deleteForeign = await request()
      .delete(`/api/v1/invoices/${String(issued.id)}`)
      .set(headersFor(mallory));
    expect(deleteForeign.status).toBe(404);

    const list = await request().get('/api/v1/invoices').set(headersFor(mallory));
    expect(list.body.documents).toHaveLength(0);

    const summary = await request().get('/api/v1/reports/summary').set(headersFor(mallory));
    expect(summary.body.currencies).toEqual([]);
    expect(summary.body.counts.sent).toBe(0);
  });

  it('refuses a viewer every writing action', async () => {
    const viewer = await registerAccount(request, { businessName: 'Viewer Co' });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });

    const create = await request()
      .post('/api/v1/invoices')
      .set(headersFor(viewer, owner.businessId))
      .send(draftBody());
    expect(create.status).toBe(403);

    const list = await request().get('/api/v1/invoices').set(headersFor(viewer, owner.businessId));
    expect(list.status).toBe(200);
  });

  it('stores and removes saved line items per business', async () => {
    const created = await request()
      .post('/api/v1/saved-items')
      .set(headersFor(owner))
      .send({ description: 'Consulting hour', unitPrice: 15000, currency: 'USD' });
    expect(created.status).toBe(201);

    const list = await request().get('/api/v1/saved-items').set(headersFor(owner));
    expect(list.body.savedItems).toHaveLength(1);

    const other = await registerAccount(request, { businessName: 'Other Co' });
    const foreignDelete = await request()
      .delete(`/api/v1/saved-items/${String(created.body.savedItem.id)}`)
      .set(headersFor(other));
    expect(foreignDelete.status).toBe(404);

    const removed = await request()
      .delete(`/api/v1/saved-items/${String(created.body.savedItem.id)}`)
      .set(headersFor(owner));
    expect(removed.status).toBe(204);

    const empty = await request().get('/api/v1/saved-items').set(headersFor(owner));
    expect(empty.body.savedItems).toHaveLength(0);
  });
});
