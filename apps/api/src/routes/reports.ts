import type { FastifyPluginAsync } from 'fastify';
import {
  agingReport,
  buildStatement,
  cashFlowReport,
  documentsCsv,
  expenseCsvQuerySchema,
  documentCsvQuerySchema,
  expensesCsv,
  reportRangeQuerySchema,
  salesByClient,
  taxSummary,
  type ReportDocument,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Client } from '../models/client.js';
import { Document, type DocumentRecord } from '../models/document.js';
import { Expense } from '../models/expense.js';
import { scoped } from '../scoped.js';
import {
  requestToday,
  serializeClient,
  serializeDocument,
  shownStatusFor,
  totalsFor,
} from '../services/documents.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ReportRouteOptions {
  config: ApiConfig;
}

/**
 * The report routes. Every number comes from the shared report functions, so the
 * screens, the CSV files and the tests all read the same rules. Currencies are
 * never added together.
 */

/** The wire document plus the tax the reports need, from the shared totals. */
function asReportDocument(doc: DocumentRecord & { _id: unknown }): ReportDocument {
  const totals = totalsFor(doc);
  return {
    id: String(doc._id),
    docType: doc.docType as ReportDocument['docType'],
    status: doc.status as ReportDocument['status'],
    issueDate: doc.issueDate ?? null,
    dueDate: doc.dueDate ?? null,
    currency: doc.currency,
    total: totals.total,
    tax: totals.tax,
    paid: totals.paid,
    balance: totals.balance,
    clientId: doc.clientId ? String(doc.clientId) : null,
    clientName: doc.clientSnapshot?.name ?? null,
    payments: (doc.payments ?? []).map((payment) => ({
      amount: payment.amount,
      paidAt: payment.paidAt,
    })),
  };
}

/** Six months back to today, or the dates the caller asked for. */
function rangeFor(today: string, from?: string, to?: string): { from: string; to: string } {
  if (from || to) {
    return { from: from ?? '0000-01-01', to: to ?? today };
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const start = new Date(Date.UTC(year, month - 1 - 5, 1));
  return { from: start.toISOString().slice(0, 10), to: today };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const reportRoutes: FastifyPluginAsync<ReportRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /**
   * The dashboard summary: totals per currency, live counts, the next three
   * invoices due and the most recently touched documents. Currencies are never
   * added together, so each total is its own row.
   */
  app.get('/reports/summary', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'reports:read');

    const today = requestToday(request);
    const docs = await scoped(Document, context).find({});

    const byCurrency = new Map<
      string,
      { currency: string; billed: number; paid: number; outstanding: number; overdue: number }
    >();
    const counts = { draft: 0, sent: 0, paid: 0, void: 0, overdue: 0 };
    const dueSoon: typeof docs = [];

    for (const doc of docs) {
      counts[doc.status] += 1;
      const totals = doc.totals ?? totalsFor(doc);
      const shown = shownStatusFor(doc, today);
      if (shown === 'overdue') {
        counts.overdue += 1;
      }

      if (doc.status === 'void' || doc.status === 'draft') continue;

      const currency = doc.currency;
      const summary = byCurrency.get(currency) ?? {
        currency,
        billed: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
      };
      summary.billed += totals.total;
      summary.paid += totals.paid;
      summary.outstanding += Math.max(0, totals.balance);
      if (shown === 'overdue' && doc.docType === 'invoice') {
        summary.overdue += totals.balance;
      }
      byCurrency.set(currency, summary);

      if (
        doc.docType === 'invoice' &&
        doc.status === 'sent' &&
        totals.balance > 0 &&
        doc.dueDate &&
        doc.dueDate >= today
      ) {
        dueSoon.push(doc);
      }
    }

    dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

    const recent = [...docs]
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .slice(0, 5)
      .map((doc) => serializeDocument(doc, today));

    return {
      today,
      currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      counts,
      dueSoon: dueSoon.slice(0, 3).map((doc) => serializeDocument(doc, today)),
      recent,
    };
  });

  /** The expense report: per category and per currency, never summed across currencies. */
  app.get('/reports/expenses', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'reports:read');

    const query = parseOrThrow(expenseCsvQuerySchema, request.query ?? {});
    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      filter['date'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.category) filter['category'] = query.category;

    const expenses = (await scoped(Expense, context).find(filter, 5000)) as unknown as Array<{
      category: string;
      currency: string;
      amount: number;
    }>;

    const totals = new Map<string, { currency: string; amount: number; count: number }>();
    const categories = new Map<
      string,
      { category: string; currency: string; amount: number; count: number }
    >();

    for (const expense of expenses) {
      const total = totals.get(expense.currency) ?? {
        currency: expense.currency,
        amount: 0,
        count: 0,
      };
      total.amount += expense.amount;
      total.count += 1;
      totals.set(expense.currency, total);

      const key = `${expense.category}|${expense.currency}`;
      const row = categories.get(key) ?? {
        category: expense.category,
        currency: expense.currency,
        amount: 0,
        count: 0,
      };
      row.amount += expense.amount;
      row.count += 1;
      categories.set(key, row);
    }

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      categories: [...categories.values()].sort(
        (a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency),
      ),
    };
  });

  async function allDocuments(request: Parameters<typeof resolveTenant>[0]) {
    const context = await resolveTenant(request);
    requireAction(context, 'reports:read');
    const docs = await scoped(Document, context).find({}, 5000);
    return {
      context,
      today: requestToday(request),
      documents: docs.map((doc) => asReportDocument(doc)),
    };
  }

  /** Money in, money expected, overdue and the slowest payers. */
  app.get('/reports/cash-flow', { preHandler: authenticateRequest }, async (request) => {
    const { today, documents } = await allDocuments(request);
    const query = parseOrThrow(reportRangeQuerySchema, request.query ?? {});
    const range = rangeFor(today, query.from, query.to);
    return {
      today,
      from: range.from,
      to: range.to,
      currencies: cashFlowReport(documents, { ...range, today }),
    };
  });

  /** Unpaid invoices bucketed by how late they are. */
  app.get('/reports/aging', { preHandler: authenticateRequest }, async (request) => {
    const { today, documents } = await allDocuments(request);
    return { today, currencies: agingReport(documents, today) };
  });

  /** Sales per client for a period, largest first. */
  app.get('/reports/by-client', { preHandler: authenticateRequest }, async (request) => {
    const { today, documents } = await allDocuments(request);
    const query = parseOrThrow(reportRangeQuerySchema, request.query ?? {});
    const range = rangeFor(today, query.from, query.to);
    return salesByClient(documents, range);
  });

  /** Tax collected, by month and by quarter. */
  app.get('/reports/tax', { preHandler: authenticateRequest }, async (request) => {
    const { today, documents } = await allDocuments(request);
    const query = parseOrThrow(reportRangeQuerySchema, request.query ?? {});
    const range = rangeFor(today, query.from, query.to);
    return taxSummary(documents, range);
  });

  /** A client statement: issued invoices, an opening balance and a closing one. */
  app.get('/clients/:id/statement', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'reports:read');

    const id = (request.params as { id?: string }).id ?? '';
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      throw errors.notFound();
    }
    const client = await scoped(Client, context).findById(id);
    if (!client) {
      throw errors.notFound();
    }

    const query = parseOrThrow(reportRangeQuerySchema, request.query ?? {});
    const today = requestToday(request);
    const docs = await scoped(Document, context).find(
      { clientId: client._id, docType: 'invoice' },
      5000,
    );

    const sections = buildStatement({
      documents: docs.map((doc) => {
        const totals = totalsFor(doc);
        return {
          id: String(doc._id),
          docType: doc.docType as 'invoice',
          number: doc.number ?? null,
          status: doc.status as ReportDocument['status'],
          issueDate: doc.issueDate ?? null,
          dueDate: doc.dueDate ?? null,
          currency: doc.currency,
          total: totals.total,
          paid: totals.paid,
          balance: totals.balance,
        };
      }),
      from: query.from ?? null,
      to: query.to ?? null,
      currency: query.currency ?? null,
      today,
    });

    return {
      today,
      from: query.from ?? null,
      to: query.to ?? null,
      client: serializeClient(client),
      sections,
    };
  });

  /** Every document matching the list filters, as a CSV Excel can open. */
  app.get(
    '/reports/export/documents.csv',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const context = await resolveTenant(request);
      requireAction(context, 'reports:read');

      const query = parseOrThrow(documentCsvQuerySchema, request.query ?? {});
      const and: Record<string, unknown>[] = [];
      if (query.docType) and.push({ docType: query.docType });
      if (query.status) and.push({ status: query.status });
      if (query.clientId) {
        if (!/^[a-f0-9]{24}$/i.test(query.clientId)) throw errors.notFound();
        and.push({ clientId: query.clientId });
      }
      if (query.from || query.to) {
        and.push({
          issueDate: {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          },
        });
      }
      if (query.q) {
        const pattern = escapeRegex(query.q);
        and.push({
          $or: [
            { number: { $regex: pattern, $options: 'i' } },
            { 'clientSnapshot.name': { $regex: pattern, $options: 'i' } },
            { reference: { $regex: pattern, $options: 'i' } },
          ],
        });
      }

      const docs = await scoped(Document, context).find(
        and.length > 0 ? { $and: and } : {},
        10_000,
      );

      const csv = documentsCsv(
        docs.map((doc) => {
          const totals = totalsFor(doc);
          return {
            docType: doc.docType as ReportDocument['docType'],
            number: doc.number ?? null,
            status: doc.status,
            issueDate: doc.issueDate ?? null,
            dueDate: doc.dueDate ?? null,
            clientName: doc.clientSnapshot?.name ?? null,
            currency: doc.currency,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
            paid: totals.paid,
            balance: totals.balance,
            reference: doc.reference ?? null,
          };
        }),
      );

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="invoxa-documents.csv"')
        .header('Cache-Control', 'no-store')
        .send(csv);
    },
  );

  /** The expense list as CSV, with the same date and category filters. */
  app.get(
    '/reports/export/expenses.csv',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const context = await resolveTenant(request);
      requireAction(context, 'reports:read');

      const query = parseOrThrow(expenseCsvQuerySchema, request.query ?? {});
      const filter: Record<string, unknown> = {};
      if (query.from || query.to) {
        filter['date'] = {
          ...(query.from ? { $gte: query.from } : {}),
          ...(query.to ? { $lte: query.to } : {}),
        };
      }
      if (query.category) filter['category'] = query.category;

      const expenses = (await scoped(Expense, context).find(filter, 10_000)) as unknown as Array<{
        date: string;
        category: CsvExpenseCategory;
        vendor?: string | null;
        description: string;
        amount: number;
        taxMinor?: number | null;
        currency: string;
        billable?: boolean;
        notes?: string | null;
      }>;

      const csv = expensesCsv(
        expenses.map((expense) => ({
          date: expense.date,
          category: expense.category,
          vendor: expense.vendor ?? null,
          description: expense.description,
          amount: expense.amount,
          taxMinor: expense.taxMinor ?? 0,
          currency: expense.currency,
          billable: Boolean(expense.billable),
          notes: expense.notes ?? null,
        })),
      );

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="invoxa-expenses.csv"')
        .header('Cache-Control', 'no-store')
        .send(csv);
    },
  );
};

type CsvExpenseCategory = Parameters<typeof expensesCsv>[0][number]['category'];
