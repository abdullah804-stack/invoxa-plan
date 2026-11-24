import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types, type HydratedDocument } from 'mongoose';
import { expenseInputSchema, expenseListQuerySchema, expenseUpdateSchema } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Expense, type ExpenseRecord } from '../models/expense.js';
import { requestToday } from '../services/documents.js';
import { scoped } from '../scoped.js';
import { requireAction, resolveTenant, type TenantContext } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ExpenseRouteOptions {
  config: ApiConfig;
}

type ExpenseDocument = HydratedDocument<ExpenseRecord>;

function paramId(request: FastifyRequest): string {
  const id = (request.params as { id?: string }).id ?? '';
  if (!Types.ObjectId.isValid(id)) {
    throw errors.notFound();
  }
  return id;
}

function serialize(expense: ExpenseDocument) {
  return {
    id: String(expense._id),
    date: expense.date,
    category: expense.category,
    description: expense.description,
    vendor: expense.vendor ?? null,
    amount: expense.amount,
    currency: expense.currency,
    taxMinor: expense.taxMinor ?? 0,
    notes: expense.notes ?? null,
    billable: expense.billable ?? false,
    billedDocumentId: expense.billedDocumentId ? String(expense.billedDocumentId) : null,
    createdAt: expense.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/** Totals are per currency; expenses in different currencies are never added. */
function totalsByCurrency(expenses: { amount: number; currency: string }[]) {
  const totals = new Map<string, { currency: string; amount: number; count: number }>();
  for (const expense of expenses) {
    const current = totals.get(expense.currency) ?? {
      currency: expense.currency,
      amount: 0,
      count: 0,
    };
    current.amount += expense.amount;
    current.count += 1;
    totals.set(expense.currency, current);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

function monthBounds(today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function loadExpense(context: TenantContext, id: string): Promise<ExpenseDocument> {
  const expense = await scoped(Expense, context).findById(id);
  if (!expense) {
    throw errors.notFound();
  }
  return expense;
}

export const expenseRoutes: FastifyPluginAsync<ExpenseRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/expenses', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'expenses:read');

    const query = parseOrThrow(expenseListQuerySchema, request.query);
    const filter: Record<string, unknown> = {};
    if (query.from || query.to) {
      filter['date'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.category) filter['category'] = query.category;
    if (query.unbilled === 'true') {
      filter['billable'] = true;
      filter['billedDocumentId'] = { $exists: false };
    }

    const expenses = await scoped(Expense, context).findSorted(
      filter,
      { date: -1, createdAt: -1 },
      query.limit,
    );
    const month = monthBounds(requestToday(request));
    const monthExpenses = await scoped(Expense, context).find(
      { date: { $gte: month.from, $lte: month.to } },
      1000,
    );

    return {
      expenses: expenses.map((expense) => serialize(expense as ExpenseDocument)),
      totals: totalsByCurrency(expenses),
      month: { ...month, totals: totalsByCurrency(monthExpenses) },
    };
  });

  app.post('/expenses', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'expenses:write');

    const input = parseOrThrow(expenseInputSchema, request.body ?? {});
    const expense = await scoped(Expense, context).create({
      ...input,
      createdBy: new Types.ObjectId(context.userId),
    });

    return reply.code(201).send({ expense: serialize(expense as ExpenseDocument) });
  });

  app.get('/expenses/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'expenses:read');
    const expense = await loadExpense(context, paramId(request));
    return { expense: serialize(expense as ExpenseDocument) };
  });

  app.put('/expenses/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'expenses:write');

    const expense = await loadExpense(context, paramId(request));
    if (expense.billedDocumentId) {
      throw errors.conflict('That expense is already on an invoice');
    }
    const input = parseOrThrow(expenseUpdateSchema, request.body ?? {});

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        (expense as unknown as Record<string, unknown>)[key] = value;
      }
    }
    await expense.save();

    return { expense: serialize(expense as ExpenseDocument) };
  });

  app.delete('/expenses/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'expenses:write');

    const expense = await loadExpense(context, paramId(request));
    if (expense.billedDocumentId) {
      throw errors.conflict('That expense is already on an invoice');
    }
    await expense.deleteOne();
    return reply.code(204).send();
  });
};
