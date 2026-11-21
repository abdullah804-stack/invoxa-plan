import type { FastifyPluginAsync } from 'fastify';
import { computeOutstanding } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { Document } from '../models/document.js';
import { scoped } from '../scoped.js';
import { requestToday, serializeDocument, shownStatusFor } from '../services/documents.js';
import { requireAction, resolveTenant } from '../tenant.js';

interface ReportRouteOptions {
  config: ApiConfig;
}

interface CurrencySummary {
  currency: string;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
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

    const byCurrency = new Map<string, CurrencySummary>();
    const counts = { draft: 0, sent: 0, paid: 0, void: 0, overdue: 0 };
    const dueSoon: typeof docs = [];

    for (const doc of docs) {
      counts[doc.status] += 1;

      const totals = doc.totals ?? { total: 0, paid: 0, balance: 0 };
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
      const live = computeOutstanding([
        { total: totals.total, paid: totals.paid, status: doc.status },
      ]);
      summary.billed += live.billed;
      summary.paid += live.paid;
      summary.outstanding += live.outstanding;
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
};
