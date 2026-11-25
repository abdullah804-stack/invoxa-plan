import { describe, expect, it } from 'vitest';
import {
  agingReport,
  averageDaysToPay,
  buildStatement,
  cashFlowReport,
  documentsCsv,
  expensesCsv,
  salesByClient,
  taxSummary,
  toCsv,
  buildReminderMessage,
  mailtoUrl,
  whatsappShareUrl,
  type ReportDocument,
} from '../src/index.js';

function doc(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    id: 'd1',
    docType: 'invoice',
    status: 'sent',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    currency: 'USD',
    total: 100_000,
    tax: 10_000,
    paid: 0,
    balance: 100_000,
    clientId: 'c1',
    clientName: 'Acme',
    payments: [],
    ...overrides,
  };
}

describe('aging', () => {
  it('puts each unpaid invoice in one bucket and never mixes currencies', () => {
    const sections = agingReport(
      [
        doc({ id: 'current', dueDate: '2026-03-10' }),
        doc({ id: 'late10', dueDate: '2026-02-20' }),
        doc({ id: 'late40', dueDate: '2026-01-20', total: 50_000, balance: 50_000 }),
        doc({ id: 'late70', dueDate: '2025-12-20', total: 25_000, balance: 25_000 }),
        doc({ id: 'late120', dueDate: '2025-10-20', total: 10_000, balance: 10_000 }),
        doc({ id: 'eur', currency: 'EUR', dueDate: '2026-02-20' }),
        doc({ id: 'draft', status: 'draft', dueDate: '2026-02-20' }),
        doc({ id: 'paid', status: 'paid', balance: 0 }),
      ],
      '2026-03-02',
    );

    expect(sections.map((section) => section.currency)).toEqual(['EUR', 'USD']);
    const usd = sections[1];
    expect(usd?.total).toBe(285_000);
    expect(usd?.buckets.map((bucket) => bucket.amount)).toEqual([
      100_000, 100_000, 50_000, 25_000, 10_000,
    ]);
    expect(usd?.buckets.find((bucket) => bucket.key === '1-30')?.count).toBe(1);
  });

  it('treats an invoice with no due date as current', () => {
    const sections = agingReport([doc({ dueDate: null })], '2026-03-02');
    expect(sections[0]?.buckets[0]?.amount).toBe(100_000);
  });
});

describe('payments and cash flow', () => {
  const paidInvoice = doc({
    id: 'p1',
    status: 'paid',
    issueDate: '2026-01-01',
    paid: 100_000,
    balance: 0,
    payments: [{ amount: 100_000, paidAt: '2026-01-11T10:00:00.000Z' }],
  });
  const lateInvoice = doc({ id: 'p2', issueDate: '2026-02-01', dueDate: '2026-02-15' });

  it('averages days from issue to the last payment', () => {
    expect(averageDaysToPay([paidInvoice, lateInvoice])).toBe(10);
  });

  it('splits invoiced and collected per month and never adds currencies', () => {
    const sections = cashFlowReport(
      [
        paidInvoice,
        lateInvoice,
        doc({ id: 'eur', currency: 'EUR', issueDate: '2026-02-02', payments: [] }),
      ],
      { from: '2026-01-01', to: '2026-02-28', today: '2026-03-02' },
    );

    const usd = sections.find((section) => section.currency === 'USD');
    expect(usd?.invoiced).toBe(200_000);
    expect(usd?.collected).toBe(100_000);
    expect(usd?.overdue).toBe(100_000);
    expect(usd?.months).toEqual([
      { month: '2026-01', invoiced: 100_000, collected: 100_000 },
      { month: '2026-02', invoiced: 100_000, collected: 0 },
    ]);
    expect(usd?.slowestPayers[0]).toMatchObject({ clientName: 'Acme', averageDays: 10 });
    expect(sections.map((section) => section.currency)).toEqual(['EUR', 'USD']);
    // Drafts and void documents are not money.
    const ignored = cashFlowReport([doc({ status: 'void', issueDate: '2026-02-01' })], {
      from: '2026-01-01',
      to: '2026-02-28',
      today: '2026-03-02',
    });
    expect(ignored[0]?.invoiced ?? 0).toBe(0);
  });

  it('counts what is due this month separately from what is already late', () => {
    const sections = cashFlowReport(
      [doc({ id: 'due', issueDate: '2026-03-01', dueDate: '2026-03-20' })],
      { from: '2026-03-01', to: '2026-03-31', today: '2026-03-02' },
    );
    expect(sections[0]?.expectedThisMonth).toBe(100_000);
    expect(sections[0]?.overdue).toBe(0);
  });
});

describe('sales by client and tax', () => {
  it('groups issued invoices by client and sorts by amount', () => {
    const report = salesByClient(
      [
        doc({
          id: 'a',
          clientId: 'c1',
          clientName: 'Acme',
          total: 50_000,
          paid: 20_000,
          balance: 30_000,
        }),
        doc({
          id: 'b',
          clientId: 'c2',
          clientName: 'Beta',
          total: 90_000,
          paid: 90_000,
          balance: 0,
        }),
        doc({
          id: 'c',
          clientId: 'c1',
          clientName: 'Acme',
          total: 25_000,
          paid: 0,
          balance: 25_000,
        }),
        doc({ id: 'old', issueDate: '2025-12-01' }),
      ],
      { from: '2026-01-01', to: '2026-12-31' },
    );

    expect(report.rows.map((row) => row.clientName)).toEqual(['Beta', 'Acme']);
    expect(report.rows[1]).toMatchObject({ invoices: 2, invoiced: 75_000, outstanding: 55_000 });
    expect(report.totals).toEqual([
      { currency: 'USD', invoiced: 165_000, paid: 110_000, outstanding: 55_000 },
    ]);
  });

  it('reports tax by month and quarter with the base before tax', () => {
    const report = taxSummary(
      [
        doc({ id: 'jan', issueDate: '2026-01-15' }),
        doc({ id: 'feb', issueDate: '2026-02-10', tax: 5_000, total: 55_000 }),
        doc({ id: 'void', status: 'void', issueDate: '2026-02-11' }),
      ],
      { from: '2026-01-01', to: '2026-12-31' },
    );

    expect(report.months).toEqual([
      { period: '2026-01', currency: 'USD', taxableBase: 90_000, tax: 10_000, documents: 1 },
      { period: '2026-02', currency: 'USD', taxableBase: 50_000, tax: 5_000, documents: 1 },
    ]);
    expect(report.quarters).toEqual([
      { period: '2026-Q1', currency: 'USD', taxableBase: 140_000, tax: 15_000, documents: 2 },
    ]);
  });
});

describe('statement', () => {
  it('opens with everything before the period and closes with the running total', () => {
    const sections = buildStatement({
      documents: [
        {
          id: 'old',
          docType: 'invoice',
          number: 'INV-0001',
          status: 'sent',
          issueDate: '2026-01-05',
          dueDate: '2026-01-19',
          currency: 'USD',
          total: 100_000,
          paid: 40_000,
          balance: 60_000,
        },
        {
          id: 'new',
          docType: 'invoice',
          number: 'INV-0002',
          status: 'sent',
          issueDate: '2026-02-05',
          dueDate: '2026-02-19',
          currency: 'USD',
          total: 50_000,
          paid: 0,
          balance: 50_000,
        },
        {
          id: 'draft',
          docType: 'invoice',
          number: null,
          status: 'draft',
          issueDate: '2026-02-06',
          dueDate: null,
          currency: 'USD',
          total: 999_000,
          paid: 0,
          balance: 999_000,
        },
        {
          id: 'eur',
          docType: 'invoice',
          number: 'INV-0003',
          status: 'sent',
          issueDate: '2026-02-07',
          dueDate: null,
          currency: 'EUR',
          total: 20_000,
          paid: 0,
          balance: 20_000,
        },
      ],
      from: '2026-02-01',
      to: '2026-02-28',
      today: '2026-03-01',
    });

    const usd = sections.find((section) => section.currency === 'USD');
    expect(usd?.openingBalance).toBe(60_000);
    expect(usd?.rows).toHaveLength(1);
    expect(usd?.billed).toBe(50_000);
    expect(usd?.closingBalance).toBe(110_000);
    expect(sections.map((section) => section.currency)).toEqual(['EUR', 'USD']);
  });
});

describe('csv', () => {
  it('writes a BOM, quotes commas and never lets a cell become a formula', () => {
    const csv = toCsv(
      ['Name', 'Amount'],
      [
        ['Acme, Inc', '120.00'],
        ['=SUM(A1)', 5],
      ],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Acme, Inc"');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('writes plain decimals so a spreadsheet can add the column', () => {
    const csv = documentsCsv([
      {
        docType: 'invoice',
        number: 'INV-0001',
        status: 'sent',
        issueDate: '2026-01-01',
        dueDate: '2026-01-15',
        clientName: 'Acme',
        currency: 'USD',
        subtotal: 100_000,
        discount: 0,
        tax: 10_000,
        total: 110_000,
        paid: 40_000,
        balance: 70_000,
        reference: 'PO-9',
      },
    ]);
    expect(csv).toContain('1000.00');
    expect(csv).toContain('1100.00');
    expect(csv).toContain('700.00');
    expect(csv).toContain('INV-0001');
  });

  it('exports expenses with their category label', () => {
    const csv = expensesCsv([
      {
        date: '2026-01-02',
        category: 'travel',
        vendor: 'Rail Co',
        description: 'Train',
        amount: 4_500,
        taxMinor: 500,
        currency: 'USD',
        billable: true,
        notes: null,
      },
    ]);
    expect(csv).toContain('Travel');
    expect(csv).toContain('45.00');
    expect(csv).toContain('yes');
  });
});

describe('reminder message', () => {
  it('is polite, in the invoice language, and names the amount and due date', () => {
    const english = buildReminderMessage({
      clientName: 'Acme',
      businessName: 'Studio One',
      number: 'INV-0001',
      amount: 132_000,
      currency: 'USD',
      dueDate: '2026-01-10',
      daysUntilDue: -5,
    });
    expect(english.subject).toContain('INV-0001');
    expect(english.body).toContain('Hi Acme,');
    expect(english.body).toContain('1,320.00');
    expect(english.body).toContain('5 days ago');
    expect(english.body).toContain('Studio One');

    const spanish = buildReminderMessage({
      clientName: 'Acme',
      businessName: 'Estudio',
      number: 'INV-0002',
      amount: 10_000,
      currency: 'EUR',
      dueDate: '2026-02-01',
      daysUntilDue: 3,
      language: 'es',
    });
    expect(spanish.subject).toMatch(/^Recordatorio/);
    expect(spanish.body).toContain('vence el');
  });

  it('builds links that encode the message', () => {
    expect(whatsappShareUrl('+1 (555) 123-4567', 'Hello there')).toBe(
      'https://wa.me/15551234567?text=Hello%20there',
    );
    expect(mailtoUrl('a@b.test', 'Hi', 'Body')).toBe('mailto:a%40b.test?subject=Hi&body=Body');
  });
});
