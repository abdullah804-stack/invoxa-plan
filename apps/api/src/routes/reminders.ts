import type { FastifyPluginAsync } from 'fastify';
import { addDays } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { Business } from '../models/business.js';
import { Document } from '../models/document.js';
import { shownStatusFor, requestToday, totalsFor } from '../services/documents.js';
import { scoped } from '../scoped.js';
import { requireAction, resolveTenant } from '../tenant.js';

interface ReminderRouteOptions {
  config: ApiConfig;
}

function daysBetween(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

/**
 * What needs a nudge today: sent invoices that are overdue or due inside the
 * business's warning window. The phone turns this into local notifications and
 * the Home card; nothing is emailed, because email would need a paid service.
 */
export const reminderRoutes: FastifyPluginAsync<ReminderRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/reminders', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const business = await Business.findById(context.businessId);
    const settings = {
      enabled: business?.reminders?.enabled ?? true,
      hour: business?.reminders?.hour ?? 9,
      daysBefore: business?.reminders?.daysBefore ?? 2,
    };
    const today = requestToday(request);
    const horizon = addDays(today, settings.daysBefore);

    const documents = await scoped(Document, context).find(
      { docType: 'invoice', status: 'sent' },
      500,
    );

    const overdue: Record<string, unknown>[] = [];
    const dueSoon: Record<string, unknown>[] = [];

    for (const doc of documents) {
      const totals = doc.totals ?? totalsFor(doc);
      if (totals.balance <= 0 || !doc.dueDate) continue;

      const shownStatus = shownStatusFor(doc, today);
      if (shownStatus !== 'overdue' && shownStatus !== 'sent') continue;

      const item = {
        id: String(doc._id),
        number: doc.number ?? null,
        clientName: doc.clientSnapshot?.name ?? null,
        dueDate: doc.dueDate,
        currency: doc.currency,
        balance: totals.balance,
        total: totals.total,
        daysUntilDue: daysBetween(today, doc.dueDate),
      };

      if (shownStatus === 'overdue') {
        overdue.push(item);
      } else if (doc.dueDate <= horizon) {
        dueSoon.push(item);
      }
    }

    const byDueDate = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a['dueDate']).localeCompare(String(b['dueDate']));

    overdue.sort(byDueDate);
    dueSoon.sort(byDueDate);

    return {
      settings,
      today,
      counts: { overdue: overdue.length, dueSoon: dueSoon.length },
      overdue: overdue.slice(0, 20),
      dueSoon: dueSoon.slice(0, 20),
    };
  });
};
