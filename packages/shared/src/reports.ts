/**
 * Report rules (plan section "Reports").
 *
 * Everything here is pure: the API loads the business's documents and hands them
 * to these functions, so the numbers on a report screen are the same numbers a
 * test can check by hand. Currencies are never added together.
 *
 * A document carries its stored totals (already computed by `computeTotals`), so
 * a report never recomputes money from raw items.
 */

export interface ReportDocument {
  id: string;
  docType: 'invoice' | 'estimate' | 'credit_note';
  status: 'draft' | 'sent' | 'paid' | 'void';
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  /** Document total, in minor units. */
  total: number;
  /** Tax part of the total, in minor units. */
  tax: number;
  paid: number;
  balance: number;
  clientId: string | null;
  clientName: string | null;
  payments: readonly { amount: number; paidAt: string }[];
}

const DAY_MS = 86_400_000;

/** A calendar date as a whole day number, with no time zone shift. */
export function dayNumber(isoDate: string): number {
  return (
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ) / DAY_MS
  );
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function quarterKey(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return `${isoDate.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** Every YYYY-MM from `from` to `to`, newest last. Capped so a range cannot explode. */
export function monthsBetween(from: string, to: string, cap = 24): string[] {
  const value = from.slice(0, 7);
  const end = to.slice(0, 7);
  const months: string[] = [];
  let year = Number(value.slice(0, 4));
  let month = Number(value.slice(5, 7));

  while (months.length < cap) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    months.push(key);
    if (key >= end) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function live(document: ReportDocument): boolean {
  return document.status !== 'draft' && document.status !== 'void';
}

function inRange(date: string | null, from?: string | null, to?: string | null): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function byCurrency<T extends { currency: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.currency.localeCompare(b.currency));
}

/* ------------------------------------------------------------------ aging */

export const AGING_BUCKETS = [
  { key: 'current', label: 'Not yet due' },
  { key: '1-30', label: '1–30 days late' },
  { key: '31-60', label: '31–60 days late' },
  { key: '61-90', label: '61–90 days late' },
  { key: '90+', label: 'Over 90 days late' },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  amount: number;
  count: number;
}

export interface AgingSection {
  currency: string;
  buckets: AgingBucket[];
  total: number;
  count: number;
}

/** Which bucket a due date falls in today. A positive score is days late. */
export function agingBucketFor(dueDate: string | null, today: string): AgingBucketKey {
  if (!dueDate) return 'current';
  const late = daysBetween(dueDate, today);
  if (late <= 0) return 'current';
  if (late <= 30) return '1-30';
  if (late <= 60) return '31-60';
  if (late <= 90) return '61-90';
  return '90+';
}

/** Unpaid invoices bucketed by how late they are, per currency. */
export function agingReport(documents: readonly ReportDocument[], today: string): AgingSection[] {
  const byCurrencyMap = new Map<string, AgingSection>();

  for (const document of documents) {
    if (document.docType !== 'invoice' || document.status !== 'sent') continue;
    if (document.balance <= 0) continue;

    const section = byCurrencyMap.get(document.currency) ?? {
      currency: document.currency,
      buckets: AGING_BUCKETS.map((bucket) => ({ ...bucket, amount: 0, count: 0 })),
      total: 0,
      count: 0,
    };
    const key = agingBucketFor(document.dueDate, today);
    const bucket = section.buckets.find((entry) => entry.key === key);
    if (bucket) {
      bucket.amount += document.balance;
      bucket.count += 1;
    }
    section.total += document.balance;
    section.count += 1;
    byCurrencyMap.set(document.currency, section);
  }

  return byCurrency([...byCurrencyMap.values()]);
}

/* --------------------------------------------------------------- payments */

/** The date an invoice was finally settled, from its last payment. */
function settledOn(document: ReportDocument): string | null {
  const last = [...document.payments]
    .map((payment) => payment.paidAt.slice(0, 10))
    .sort((a, b) => a.localeCompare(b))
    .pop();
  return last ?? null;
}

/** How many days a paid invoice took, from issue date to its last payment. */
export function daysToPay(document: ReportDocument): number | null {
  if (document.docType !== 'invoice' || document.status !== 'paid') return null;
  if (!document.issueDate) return null;
  const paidOn = settledOn(document);
  if (!paidOn) return null;
  return Math.max(0, daysBetween(document.issueDate, paidOn));
}

/** The average across settled invoices, or null when nothing has been paid yet. */
export function averageDaysToPay(documents: readonly ReportDocument[]): number | null {
  const days = documents.map(daysToPay).filter((value): value is number => value !== null);
  if (days.length === 0) return null;
  return Math.round(days.reduce((total, value) => total + value, 0) / days.length);
}

export interface SlowPayer {
  clientId: string | null;
  clientName: string;
  currency: string;
  averageDays: number;
  settled: number;
}

/** Clients whose paid invoices took the longest, worst first. */
export function slowestPayers(documents: readonly ReportDocument[], limit = 5): SlowPayer[] {
  const groups = new Map<string, { row: SlowPayer; days: number }>();

  for (const document of documents) {
    const days = daysToPay(document);
    if (days === null) continue;

    const name = document.clientName ?? 'No client';
    const key = `${document.clientId ?? name}|${document.currency}`;
    const group = groups.get(key) ?? {
      row: {
        clientId: document.clientId,
        clientName: name,
        currency: document.currency,
        averageDays: 0,
        settled: 0,
      },
      days: 0,
    };
    group.days += days;
    group.row.settled += 1;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group.row,
      averageDays: Math.round(group.days / Math.max(1, group.row.settled)),
    }))
    .sort((a, b) => b.averageDays - a.averageDays || a.clientName.localeCompare(b.clientName))
    .slice(0, limit);
}

/* -------------------------------------------------------------- cash flow */

export interface CashFlowMonth {
  month: string;
  invoiced: number;
  collected: number;
}

export interface CashFlowSection {
  currency: string;
  invoiced: number;
  collected: number;
  overdue: number;
  expectedThisMonth: number;
  averageDaysToPay: number | null;
  months: CashFlowMonth[];
  slowestPayers: SlowPayer[];
}

export interface CashFlowRange {
  from: string;
  to: string;
  today: string;
}

/**
 * Money in and money expected. Invoiced counts invoices issued in the range;
 * collected counts payments received in the range (including applied credit
 * notes); overdue and expectedThisMonth are live balances as of today.
 */
export function cashFlowReport(
  documents: readonly ReportDocument[],
  range: CashFlowRange,
): CashFlowSection[] {
  const monthKeys = monthsBetween(range.from, range.to);
  const todayMonth = monthKey(range.today);
  const sections = new Map<string, CashFlowSection>();

  const sectionFor = (currency: string): CashFlowSection => {
    const existing = sections.get(currency);
    if (existing) return existing;
    const created: CashFlowSection = {
      currency,
      invoiced: 0,
      collected: 0,
      overdue: 0,
      expectedThisMonth: 0,
      averageDaysToPay: averageDaysToPay(
        documents.filter((document) => document.currency === currency),
      ),
      months: monthKeys.map((month) => ({ month, invoiced: 0, collected: 0 })),
      slowestPayers: slowestPayers(documents.filter((document) => document.currency === currency)),
    };
    sections.set(currency, created);
    return created;
  };

  for (const document of documents) {
    if (!live(document)) continue;
    const section = sectionFor(document.currency);

    if (document.docType === 'invoice' && inRange(document.issueDate, range.from, range.to)) {
      section.invoiced += document.total;
      const month = section.months.find(
        (entry) => entry.month === monthKey(document.issueDate ?? ''),
      );
      if (month) month.invoiced += document.total;
    }

    for (const payment of document.payments) {
      const paidOn = payment.paidAt.slice(0, 10);
      if (!inRange(paidOn, range.from, range.to)) continue;
      section.collected += payment.amount;
      const month = section.months.find((entry) => entry.month === monthKey(paidOn));
      if (month) month.collected += payment.amount;
    }

    if (document.docType !== 'invoice' || document.status !== 'sent') continue;
    if (document.balance <= 0) continue;

    if (document.dueDate && document.dueDate < range.today) {
      section.overdue += document.balance;
    }
    if (document.dueDate && monthKey(document.dueDate) === todayMonth) {
      section.expectedThisMonth += document.balance;
    }
  }

  return byCurrency([...sections.values()]);
}

/* ----------------------------------------------------------- sales by client */

export interface ClientSalesRow {
  clientId: string | null;
  clientName: string;
  currency: string;
  invoices: number;
  invoiced: number;
  paid: number;
  outstanding: number;
}

export interface SalesByClientReport {
  from: string | null;
  to: string | null;
  rows: ClientSalesRow[];
  totals: { currency: string; invoiced: number; paid: number; outstanding: number }[];
}

/** Invoices issued in the range, grouped by client and currency, largest first. */
export function salesByClient(
  documents: readonly ReportDocument[],
  range: { from?: string | null; to?: string | null },
): SalesByClientReport {
  const rows = new Map<string, ClientSalesRow>();
  const totals = new Map<
    string,
    { currency: string; invoiced: number; paid: number; outstanding: number }
  >();

  for (const document of documents) {
    if (document.docType !== 'invoice' || !live(document)) continue;
    if (!inRange(document.issueDate, range.from, range.to)) continue;

    const name = document.clientName ?? 'No client';
    const key = `${document.clientId ?? name}|${document.currency}`;
    const row = rows.get(key) ?? {
      clientId: document.clientId,
      clientName: name,
      currency: document.currency,
      invoices: 0,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    };
    row.invoices += 1;
    row.invoiced += document.total;
    row.paid += document.paid;
    row.outstanding += Math.max(0, document.balance);
    rows.set(key, row);

    const total = totals.get(document.currency) ?? {
      currency: document.currency,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    };
    total.invoiced += document.total;
    total.paid += document.paid;
    total.outstanding += Math.max(0, document.balance);
    totals.set(document.currency, total);
  }

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    rows: [...rows.values()].sort(
      (a, b) =>
        b.invoiced - a.invoiced ||
        a.clientName.localeCompare(b.clientName) ||
        a.currency.localeCompare(b.currency),
    ),
    totals: byCurrency([...totals.values()]),
  };
}

/* -------------------------------------------------------------------- tax */

export interface TaxPeriodRow {
  period: string;
  currency: string;
  taxableBase: number;
  tax: number;
  documents: number;
}

export interface TaxSummaryReport {
  from: string | null;
  to: string | null;
  months: TaxPeriodRow[];
  quarters: TaxPeriodRow[];
}

/**
 * Tax collected on issued invoices, by month and by quarter. The taxable base is
 * the total less its tax part, so tax-included and tax-added invoices report the
 * same way. Credit notes are not netted here; they carry no tax in this build.
 */
export function taxSummary(
  documents: readonly ReportDocument[],
  range: { from?: string | null; to?: string | null },
): TaxSummaryReport {
  const months = new Map<string, TaxPeriodRow>();
  const quarters = new Map<string, TaxPeriodRow>();

  const add = (map: Map<string, TaxPeriodRow>, period: string, document: ReportDocument) => {
    const key = `${period}|${document.currency}`;
    const row = map.get(key) ?? {
      period,
      currency: document.currency,
      taxableBase: 0,
      tax: 0,
      documents: 0,
    };
    row.taxableBase += document.total - document.tax;
    row.tax += document.tax;
    row.documents += 1;
    map.set(key, row);
  };

  for (const document of documents) {
    if (document.docType !== 'invoice' || !live(document)) continue;
    if (!inRange(document.issueDate, range.from, range.to)) continue;
    const issueDate = document.issueDate as string;
    add(months, monthKey(issueDate), document);
    add(quarters, quarterKey(issueDate), document);
  }

  const order = (a: TaxPeriodRow, b: TaxPeriodRow) =>
    a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency);

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    months: [...months.values()].sort(order),
    quarters: [...quarters.values()].sort(order),
  };
}
