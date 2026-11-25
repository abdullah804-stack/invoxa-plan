import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types, type FilterQuery } from 'mongoose';
import {
  addDays,
  assertPaymentAllowed,
  can,
  canTransition,
  documentInputSchema,
  lateFeeAmount,
  documentListQuerySchema,
  documentUpdateSchema,
  dueDateIsValid,
  duplicateDocumentSchema,
  creditApplicationSchema,
  issuedDocumentUpdateSchema,
  issueDocumentSchema,
  paymentInputSchema,
  statusChangeSchema,
  sumMinor,
  type ClientSnapshot,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Business } from '../models/business.js';
import { Client } from '../models/client.js';
import { Expense } from '../models/expense.js';
import { Document, type DocumentRecord } from '../models/document.js';
import { decodeCursor, encodeCursor, escapeRegex } from '../pagination.js';
import { scoped } from '../scoped.js';
import {
  applyTotals,
  buildBrandSnapshot,
  buildClientSnapshot,
  newLineItemId,
  requestToday,
  serializeDocument,
  totalsFor,
  type DocumentDocument,
} from '../services/documents.js';
import { Project, TimeEntry } from '../models/project.js';
import { assignDocumentNumber } from '../services/numbering.js';
import { logActivity } from '../services/activity.js';
import { requireAction, resolveTenant, type TenantContext } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface DocumentRouteOptions {
  config: ApiConfig;
}

function paramId(request: FastifyRequest): string {
  const id = (request.params as { id?: string }).id ?? '';
  if (!Types.ObjectId.isValid(id)) {
    throw errors.notFound();
  }
  return id;
}

async function loadDocument(context: TenantContext, id: string): Promise<DocumentDocument> {
  const doc = await scoped(Document, context).findById(id);
  if (!doc) {
    throw errors.notFound();
  }
  return doc;
}

async function optionalClient(context: TenantContext, clientId: string | undefined) {
  if (!clientId) return null;
  if (!Types.ObjectId.isValid(clientId)) {
    throw errors.notFound();
  }
  const client = await scoped(Client, context).findById(clientId);
  if (!client) {
    throw errors.notFound();
  }
  return client;
}

function assertDates(issueDate: string | undefined, dueDate: string | undefined): void {
  if (issueDate && dueDate && !dueDateIsValid(issueDate, dueDate)) {
    throw errors.validation([
      { path: 'dueDate', message: 'Due date cannot be before the issue date' },
    ]);
  }
}

function optionalObjectId(value: string | undefined) {
  if (!value) return undefined;
  if (!Types.ObjectId.isValid(value)) {
    throw errors.notFound();
  }
  return new Types.ObjectId(value);
}

interface DraftProject {
  _id: Types.ObjectId;
  currency: string;
  clientId?: Types.ObjectId | null;
}

/** Loads a project for a draft, 404 for anything outside this business. */
async function draftProject(context: TenantContext, projectId: string): Promise<DraftProject> {
  const project = await scoped(Project, context).findById(projectId);
  if (!project) {
    throw errors.notFound();
  }
  return project as unknown as DraftProject;
}

/** A project can only bill into a draft for the same client and currency. */
function assertProjectFits(project: DraftProject, currency: string, clientId: unknown): void {
  if (project.currency !== currency) {
    throw errors.validation([
      { path: 'projectId', message: `This project bills in ${project.currency}` },
    ]);
  }
  if (project.clientId && clientId && String(project.clientId) !== String(clientId)) {
    throw errors.validation([
      { path: 'projectId', message: 'This project belongs to another client' },
    ]);
  }
}

/**
 * Adds a project's unbilled billable time to a draft as lines grouped by rate and
 * description, and answers the entries to mark as billed once the draft is saved.
 */
export async function addProjectTime(
  doc: DocumentDocument,
  project: DraftProject,
  context: TenantContext,
): Promise<Types.ObjectId[]> {
  assertProjectFits(project, doc.currency, doc.clientId);

  const entries = (await scoped(TimeEntry, context).findSorted(
    { projectId: project._id, billable: true, billedDocumentId: { $exists: false } },
    { date: 1, createdAt: 1 },
    500,
  )) as unknown as Array<{
    _id: Types.ObjectId;
    minutes: number;
    description: string;
    hourlyRateMinor: number;
  }>;
  if (entries.length === 0) return [];

  const groups = new Map<
    string,
    { description: string; minutes: number; rate: number; ids: string[] }
  >();
  for (const entry of entries) {
    const key = `${entry.hourlyRateMinor}|${entry.description}`;
    const group = groups.get(key) ?? {
      description: entry.description,
      minutes: 0,
      rate: entry.hourlyRateMinor,
      ids: [],
    };
    group.minutes += entry.minutes;
    group.ids.push(String(entry._id));
    groups.set(key, group);
  }

  const lines = [...groups.values()].map((group) => ({
    id: newLineItemId(),
    description: group.description,
    quantity: Math.round((group.minutes / 60) * 1000) / 1000,
    unitPrice: group.rate,
    unit: 'hours',
    timeEntryIds: group.ids,
  }));
  doc.items = [...(doc.items ?? []), ...lines] as typeof doc.items;

  return entries.map((entry) => entry._id);
}

/** Puts a draft's billed time back on the unbilled list and drops those lines. */
async function releaseProjectTime(doc: DocumentDocument): Promise<void> {
  const items = doc.items ?? [];
  const derived = items.filter((item) => (item.timeEntryIds ?? []).length > 0);
  doc.items = items.filter((item) => (item.timeEntryIds ?? []).length === 0) as typeof doc.items;

  const filter: Record<string, unknown> = {
    business: doc.business,
    billedDocumentId: doc._id,
  };
  const ids = derived.flatMap((item) => item.timeEntryIds ?? []);
  if (ids.length > 0) filter['_id'] = { $in: ids };
  await TimeEntry.updateMany(filter, { $unset: { billedDocumentId: 1 } });
}

/**
 * Expenses travel on the lines that carry their ids. A referenced expense is
 * checked and billed to the draft; one that is no longer referenced goes back to
 * unbilled, so removing a line never strands a receipt. Validation happens before
 * anything is written, because a new draft is created before this runs.
 */
async function referencedExpenses(
  currency: string,
  items: Array<{ expenseIds?: string[] | null }>,
  context: TenantContext,
  docId?: string,
): Promise<Types.ObjectId[]> {
  const raw = [...new Set(items.flatMap((item) => item.expenseIds ?? []))];
  const ids = raw.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (ids.length === 0) return [];

  const expenses = (await scoped(Expense, context).find(
    { _id: { $in: ids } },
    ids.length,
  )) as unknown as Array<{
    _id: Types.ObjectId;
    billable?: boolean;
    currency: string;
    billedDocumentId?: Types.ObjectId | null;
  }>;
  if (expenses.length !== ids.length) {
    throw errors.notFound();
  }

  for (const expense of expenses) {
    if (!expense.billable) {
      throw errors.validation([
        { path: 'items', message: 'Only billable expenses can go on an invoice' },
      ]);
    }
    if (expense.currency !== currency) {
      throw errors.validation([
        { path: 'items', message: `That expense is in ${expense.currency}` },
      ]);
    }
    if (expense.billedDocumentId && String(expense.billedDocumentId) !== String(docId ?? '')) {
      throw errors.conflict('That expense is already on another invoice');
    }
  }

  return ids;
}

async function setExpenseBilling(doc: DocumentDocument, ids: Types.ObjectId[]): Promise<void> {
  if (ids.length > 0) {
    await Expense.updateMany(
      { business: doc.business, _id: { $in: ids } },
      { $set: { billedDocumentId: doc._id } },
    );
  }
  await Expense.updateMany(
    {
      business: doc.business,
      billedDocumentId: doc._id,
      ...(ids.length > 0 ? { _id: { $nin: ids } } : {}),
    },
    { $unset: { billedDocumentId: 1 } },
  );
}

async function markTimeBilled(doc: DocumentDocument, ids: Types.ObjectId[]): Promise<void> {
  if (ids.length === 0) return;
  await TimeEntry.updateMany(
    { business: doc.business, _id: { $in: ids } },
    { $set: { billedDocumentId: doc._id } },
  );
}

export const documentRoutes: FastifyPluginAsync<DocumentRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /** Draft list with stored and derived filters, search, sort and keyset paging. */
  app.get('/invoices', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const query = parseOrThrow(documentListQuerySchema, request.query);
    const today = requestToday(request);
    const and: Record<string, unknown>[] = [];

    if (query.docType) and.push({ docType: query.docType });
    if (query.clientId) {
      if (!Types.ObjectId.isValid(query.clientId)) {
        throw errors.notFound();
      }
      and.push({ clientId: new Types.ObjectId(query.clientId) });
    }

    switch (query.status) {
      case undefined:
        break;
      case 'draft':
      case 'paid':
      case 'void':
        and.push({ status: query.status });
        break;
      case 'sent':
        and.push({ status: 'sent' });
        break;
      case 'partial':
        and.push({ status: 'sent', 'totals.paid': { $gt: 0 }, 'totals.balance': { $gt: 0 } });
        break;
      case 'overdue':
        and.push({
          docType: 'invoice',
          status: 'sent',
          'totals.balance': { $gt: 0 },
          dueDate: { $lt: today, $ne: null },
        });
        break;
      case 'expired':
        and.push({
          docType: 'estimate',
          status: 'sent',
          validUntil: { $lt: today, $ne: null },
        });
        break;
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

    const sortField =
      query.sort === 'amount' ? 'totals.total' : query.sort === 'dueDate' ? 'dueDate' : 'createdAt';
    const sortDirection: 1 | -1 = query.sort === 'amount' || query.sort === 'newest' ? -1 : 1;

    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      const id = cursor['id'];
      const value = cursor['v'];
      if (typeof id !== 'string' || Types.ObjectId.isValid(id) === false) {
        throw errors.validation([{ path: 'cursor', message: 'Cursor is not valid' }]);
      }
      const comparable = typeof value === 'number' || typeof value === 'string' ? value : null;
      if (comparable === null) {
        throw errors.validation([{ path: 'cursor', message: 'Cursor is not valid' }]);
      }
      const keyValue =
        sortField === 'createdAt' && typeof comparable === 'string'
          ? new Date(comparable)
          : comparable;
      const comparison = sortDirection === 1 ? '$gt' : '$lt';
      and.push({
        $or: [
          { [sortField]: { [comparison]: keyValue } },
          { [sortField]: keyValue, _id: { [comparison]: new Types.ObjectId(id) } },
        ],
      });
    }

    const filter: FilterQuery<DocumentRecord> = {};
    if (and.length > 0) {
      filter.$and = and as FilterQuery<DocumentRecord>[];
    }

    const docs = await scoped(Document, context).findSorted(
      filter,
      { [sortField]: sortDirection, _id: sortDirection },
      query.limit + 1,
    );

    const hasMore = docs.length > query.limit;
    const page = hasMore ? docs.slice(0, query.limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            v:
              query.sort === 'newest' || query.sort === 'oldest'
                ? (last.createdAt?.toISOString() ?? new Date(0).toISOString())
                : query.sort === 'amount'
                  ? (last.totals?.total ?? 0)
                  : (last.dueDate ?? ''),
            id: String(last._id),
          })
        : null;

    return {
      documents: page.map((doc) => serializeDocument(doc, today)),
      nextCursor,
    };
  });

  app.get('/invoices/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const doc = await loadDocument(context, paramId(request));
    return { document: serializeDocument(doc, requestToday(request)) };
  });

  /** POST is idempotent on clientUuid, so a retried sync never duplicates. */
  app.post('/invoices', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:create');

    const input = parseOrThrow(documentInputSchema, request.body ?? {});
    const documents = scoped(Document, context);

    const existing = await documents.findOne({ clientUuid: input.clientUuid });
    if (existing) {
      if (existing.docType !== input.docType) {
        throw errors.conflict('A draft with that device ID already exists as another type');
      }
      return reply.code(200).send({ document: serializeDocument(existing, requestToday(request)) });
    }

    const client = await optionalClient(context, input.clientId);
    const clientSnapshot: ClientSnapshot | undefined = client
      ? buildClientSnapshot(client)
      : input.clientSnapshot;

    assertDates(input.issueDate, input.dueDate);

    const project = input.projectId ? await draftProject(context, input.projectId) : null;
    if (project) assertProjectFits(project, input.currency, client?._id ?? input.clientId);
    const expenseIds = await referencedExpenses(input.currency, input.items, context);

    const doc = await documents.create({
      clientUuid: input.clientUuid,
      docType: input.docType,
      status: 'draft',
      number: null,
      ...(client ? { clientId: client._id } : {}),
      ...(clientSnapshot ? { clientSnapshot } : {}),
      ...(project ? { projectId: project._id } : {}),
      items: input.items.map((item) => ({
        id: item.id ?? newLineItemId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
        ...(item.unit ? { unit: item.unit } : {}),
        ...(item.timeEntryIds && item.timeEntryIds.length > 0
          ? { timeEntryIds: item.timeEntryIds }
          : {}),
        ...(item.expenseIds && item.expenseIds.length > 0 ? { expenseIds: item.expenseIds } : {}),
      })),
      currency: input.currency,
      discount:
        input.discount === null || input.discount === undefined
          ? undefined
          : input.discount.type === 'percent'
            ? { type: 'percent', valueBp: input.discount.valueBp }
            : { type: 'fixed', valueMinor: input.discount.valueMinor },
      taxRateBp: input.taxRateBp,
      taxMode: input.taxMode,
      ...(input.issueDate ? { issueDate: input.issueDate } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(input.validUntil ? { validUntil: input.validUntil } : {}),
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      source: input.source,
      ...(optionalObjectId(input.convertedFrom)
        ? { convertedFrom: optionalObjectId(input.convertedFrom) }
        : {}),
      createdBy: new Types.ObjectId(context.userId),
    });

    const billed =
      project && input.billProjectTime ? await addProjectTime(doc, project, context) : [];
    applyTotals(doc);
    await doc.save();
    await markTimeBilled(doc, billed);
    await setExpenseBilling(doc, expenseIds);

    await logActivity(context, {
      type: 'document.created',
      summary: `Saved a ${input.docType.replace('_', ' ')} draft`,
      entityId: String(doc._id),
    });

    return reply.code(201).send({ document: serializeDocument(doc, requestToday(request)) });
  });

  app.put('/invoices/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    const doc = await loadDocument(context, paramId(request));
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (doc.status !== 'draft') {
      requireAction(context, 'drafts:create');
      const locked = [
        'items',
        'clientId',
        'clientSnapshot',
        'projectId',
        'billProjectTime',
        'currency',
        'discount',
        'taxRateBp',
        'taxMode',
        'issueDate',
        'validUntil',
        'reference',
        'source',
        'convertedFrom',
      ].filter((field) => field in body);
      if (locked.length > 0) {
        throw errors.conflict(
          'Issued documents cannot change items, prices, client or currency. They can change notes, terms, due date and payments.',
        );
      }

      const input = parseOrThrow(issuedDocumentUpdateSchema, body);
      if (input.notes !== undefined) doc.notes = input.notes || undefined;
      if (input.terms !== undefined) doc.terms = input.terms || undefined;
      if (input.dueDate !== undefined) {
        assertDates(doc.issueDate ?? undefined, input.dueDate);
        doc.dueDate = input.dueDate;
      }
      await doc.save();
      return { document: serializeDocument(doc, requestToday(request)) };
    }

    requireAction(context, 'drafts:create');
    const input = parseOrThrow(documentUpdateSchema, body);

    if (input.clientId !== undefined) {
      const client = await optionalClient(context, input.clientId || undefined);
      doc.clientId = client ? client._id : undefined;
      if (client) doc.clientSnapshot = buildClientSnapshot(client);
      else doc.clientSnapshot = undefined;
    }
    if (input.clientSnapshot !== undefined && !doc.clientId) {
      doc.clientSnapshot = input.clientSnapshot;
    }
    if (input.projectId !== undefined) {
      const next = input.projectId ? await draftProject(context, input.projectId) : null;
      if (next) {
        assertProjectFits(
          next,
          input.currency ?? doc.currency,
          input.clientId !== undefined ? input.clientId || undefined : doc.clientId,
        );
      }
      if (String(next?._id ?? '') !== String(doc.projectId ?? '')) {
        // The old project's time and the lines that came from it go back, so the
        // same hours are never billed twice.
        await releaseProjectTime(doc);
        doc.projectId = next ? next._id : undefined;
      }
    }
    if (input.items !== undefined) {
      doc.items = input.items.map((item) => ({
        id: item.id ?? newLineItemId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
        ...(item.unit ? { unit: item.unit } : {}),
        ...(item.timeEntryIds && item.timeEntryIds.length > 0
          ? { timeEntryIds: item.timeEntryIds }
          : {}),
        ...(item.expenseIds && item.expenseIds.length > 0 ? { expenseIds: item.expenseIds } : {}),
      })) as typeof doc.items;
    }
    const expenseIds = await referencedExpenses(
      doc.currency,
      doc.items ?? [],
      context,
      String(doc._id),
    );
    if (input.currency !== undefined) doc.currency = input.currency;
    if (input.discount !== undefined) {
      doc.discount =
        input.discount === null
          ? undefined
          : input.discount.type === 'percent'
            ? { type: 'percent', valueBp: input.discount.valueBp }
            : { type: 'fixed', valueMinor: input.discount.valueMinor };
    }
    if (input.taxRateBp !== undefined) doc.taxRateBp = input.taxRateBp;
    if (input.taxMode !== undefined) doc.taxMode = input.taxMode;
    if (input.issueDate !== undefined) doc.issueDate = input.issueDate;
    if (input.dueDate !== undefined) doc.dueDate = input.dueDate;
    if (input.validUntil !== undefined) doc.validUntil = input.validUntil;
    if (input.reference !== undefined) doc.reference = input.reference || undefined;
    if (input.notes !== undefined) doc.notes = input.notes || undefined;
    if (input.terms !== undefined) doc.terms = input.terms || undefined;
    const project =
      input.billProjectTime && doc.projectId
        ? await draftProject(context, String(doc.projectId))
        : null;
    const billed = project ? await addProjectTime(doc, project, context) : [];

    assertDates(doc.issueDate ?? undefined, doc.dueDate ?? undefined);
    applyTotals(doc);
    await doc.save();
    await markTimeBilled(doc, billed);
    await setExpenseBilling(doc, expenseIds);

    return { document: serializeDocument(doc, requestToday(request)) };
  });

  /** Drafts can be deleted; issued documents are voided so numbers never repeat. */
  app.delete('/invoices/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:deleteOwn');

    const doc = await loadDocument(context, paramId(request));
    if (doc.status !== 'draft') {
      throw errors.conflict('Issued documents are voided, never deleted');
    }
    if (!can(context.role, 'drafts:deleteAny') && String(doc.createdBy ?? '') !== context.userId) {
      throw errors.forbidden('You can only delete your own drafts');
    }

    // Billed time and expenses go back to unbilled so they can be used again.
    await TimeEntry.updateMany(
      { business: doc.business, billedDocumentId: doc._id },
      { $unset: { billedDocumentId: 1 } },
    );
    await Expense.updateMany(
      { business: doc.business, billedDocumentId: doc._id },
      { $unset: { billedDocumentId: 1 } },
    );
    await doc.deleteOne();
    return reply.code(204).send();
  });

  /**
   * A late fee is one stored adjustment, added by an owner after the due date
   * and grace days. The amount comes from the business rule, never the request.
   */
  app.post('/invoices/:id/late-fee', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'lateFee:apply');

    const doc = await loadDocument(context, paramId(request));
    const business = await Business.findById(context.businessId);
    if (!business) {
      throw errors.notFound();
    }

    const rule = business.lateFee;
    if (!rule?.enabled) {
      throw errors.validation([], 'Late fees are off for this business');
    }
    if (doc.docType !== 'invoice' || doc.status !== 'sent') {
      throw errors.conflict('Late fees only apply to sent invoices');
    }
    if ((doc.adjustments ?? []).some((adjustment) => adjustment.type === 'late_fee')) {
      throw errors.conflict('This invoice already has a late fee');
    }
    if (!doc.dueDate) {
      throw errors.conflict('This invoice has no due date');
    }

    const today = requestToday(request);
    const eligibleFrom = addDays(doc.dueDate, rule.graceDays ?? 0);
    if (today <= eligibleFrom) {
      throw errors.validation([], `A late fee can be added after ${eligibleFrom}`);
    }

    const balance = totalsFor(doc).balance;
    if (balance <= 0) {
      throw errors.conflict('Nothing is due on this invoice');
    }
    const amount = lateFeeAmount({ type: rule.type ?? 'percent', value: rule.value ?? 0 }, balance);
    if (amount <= 0) {
      throw errors.validation([], 'The late-fee rule comes to nothing');
    }

    doc.adjustments = [
      ...(doc.adjustments ?? []),
      {
        id: newLineItemId(),
        type: 'late_fee',
        amount,
        ...(rule.type === 'percent' ? { basisPoints: rule.value ?? 0 } : {}),
        appliedAt: today,
        appliedBy: new Types.ObjectId(context.userId),
        effectiveDate: today,
      },
    ] as typeof doc.adjustments;
    applyTotals(doc);
    await doc.save();

    await logActivity(context, {
      type: 'late_fee.added',
      summary: `Added a late fee to ${doc.number ?? 'an invoice'}`,
      entityId: String(doc._id),
      ...(doc.number ? { entityLabel: doc.number } : {}),
    });

    return { document: serializeDocument(doc, today), amount };
  });

  /** Issue assigns the number atomically and freezes client and brand copies. */
  app.post('/invoices/:id/issue', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:issue');

    const doc = await loadDocument(context, paramId(request));
    if (doc.status !== 'draft') {
      throw errors.conflict('Only a draft can be issued');
    }
    if (!doc.items || doc.items.length === 0) {
      throw errors.validation([{ path: 'items', message: 'Add at least one line before issuing' }]);
    }

    const business = await Business.findById(context.businessId);
    if (!business) {
      throw errors.notFound();
    }

    const input = parseOrThrow(issueDocumentSchema, request.body ?? {});
    const issueDate = input.issueDate ?? requestToday(request);
    const dueDate = input.dueDate ?? doc.dueDate ?? addDays(issueDate, business.dueDays ?? 14);
    assertDates(issueDate, dueDate);

    if (doc.clientId) {
      const client = await scoped(Client, context).findById(String(doc.clientId));
      if (client) {
        doc.clientSnapshot = buildClientSnapshot(client);
      }
    }

    doc.issueDate = issueDate;
    doc.dueDate = dueDate;
    doc.brandSnapshot = buildBrandSnapshot(business) as unknown as typeof doc.brandSnapshot;
    doc.number = await assignDocumentNumber(context.businessId, doc.docType);
    doc.status = 'sent';
    applyTotals(doc);
    await doc.save();

    await logActivity(context, {
      type: 'document.issued',
      summary: `Issued ${doc.number}`,
      entityId: String(doc._id),
      ...(doc.number ? { entityLabel: doc.number } : {}),
    });

    return { document: serializeDocument(doc, requestToday(request)) };
  });

  app.post(
    '/invoices/:id/payments',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const context = await resolveTenant(request);
      requireAction(context, 'payments:write');

      const doc = await loadDocument(context, paramId(request));
      if (doc.status !== 'sent') {
        throw errors.conflict('Payments can only be recorded on a sent document');
      }

      const input = parseOrThrow(paymentInputSchema, request.body ?? {});
      const balance = totalsFor(doc).balance;
      try {
        assertPaymentAllowed(balance, input.amount);
      } catch (error) {
        throw errors.validation([
          {
            path: 'amount',
            message: error instanceof Error ? error.message : 'Payment is invalid',
          },
        ]);
      }

      doc.payments.push({
        id: newLineItemId(),
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt ?? new Date().toISOString(),
        ...(input.reference ? { reference: input.reference } : {}),
        ...(input.note ? { note: input.note } : {}),
        recordedBy: new Types.ObjectId(context.userId),
        recordedAt: new Date().toISOString(),
        settlesBalance: false,
      });

      applyTotals(doc);
      if (totalsFor(doc).balance === 0) {
        doc.status = 'paid';
      }
      await doc.save();

      await logActivity(context, {
        type: 'payment.recorded',
        summary: `Recorded a payment on ${doc.number ?? 'a document'}`,
        entityId: String(doc._id),
        ...(doc.number ? { entityLabel: doc.number } : {}),
      });

      return reply.code(201).send({ document: serializeDocument(doc, requestToday(request)) });
    },
  );

  /** Mark paid records a settlement payment; undo removes exactly that one. */
  app.post('/invoices/:id/status', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'payments:write');

    const doc = await loadDocument(context, paramId(request));
    const input = parseOrThrow(statusChangeSchema, request.body ?? {});

    if (input.status === 'void') {
      requireAction(context, 'documents:void');
    }
    if (!canTransition(doc.status, input.status)) {
      throw errors.conflict(`Cannot change status from ${doc.status} to ${input.status}`);
    }

    if (input.status === 'paid') {
      const balance = totalsFor(doc).balance;
      if (balance > 0) {
        doc.payments.push({
          id: newLineItemId(),
          amount: balance,
          method: 'other',
          paidAt: new Date().toISOString(),
          note: 'Marked paid',
          recordedBy: new Types.ObjectId(context.userId),
          recordedAt: new Date().toISOString(),
          settlesBalance: true,
        });
      }
      doc.status = 'paid';
      applyTotals(doc);
    }

    if (input.status === 'sent') {
      // Undo a mistaken Mark paid without touching real recorded payments.
      doc.payments = doc.payments.filter(
        (payment) => !payment.settlesBalance,
      ) as typeof doc.payments;
      doc.status = 'sent';
      applyTotals(doc);
    }

    if (input.status === 'void') {
      doc.status = 'void';
    }

    await doc.save();

    if (input.status === 'void') {
      await logActivity(context, {
        type: 'document.voided',
        summary: `Voided ${doc.number ?? 'a document'}`,
        entityId: String(doc._id),
        ...(doc.number ? { entityLabel: doc.number } : {}),
      });
    }

    return { document: serializeDocument(doc, requestToday(request)) };
  });

  app.post(
    '/invoices/:id/duplicate',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const context = await resolveTenant(request);
      requireAction(context, 'documents:duplicate');

      const doc = await loadDocument(context, paramId(request));
      const input = parseOrThrow(duplicateDocumentSchema, request.body ?? {});

      const copy = await scoped(Document, context).create({
        clientUuid: input.clientUuid ?? new Types.ObjectId().toString(),
        docType: doc.docType,
        status: 'draft',
        number: null,
        ...(doc.clientId ? { clientId: doc.clientId } : {}),
        ...(doc.clientSnapshot ? { clientSnapshot: doc.clientSnapshot } : {}),
        ...(doc.projectId ? { projectId: doc.projectId } : {}),
        items: (doc.items ?? []).map((item) => ({
          id: newLineItemId(),
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
          ...(item.unit ? { unit: item.unit } : {}),
        })),
        currency: doc.currency,
        ...(doc.discount ? { discount: doc.discount } : {}),
        taxRateBp: doc.taxRateBp ?? 0,
        taxMode: doc.taxMode ?? 'added',
        ...(doc.validUntil ? { validUntil: doc.validUntil } : {}),
        ...(doc.reference ? { reference: doc.reference } : {}),
        ...(doc.notes ? { notes: doc.notes } : {}),
        ...(doc.terms ? { terms: doc.terms } : {}),
        source: 'duplicate',
        createdBy: new Types.ObjectId(context.userId),
      });

      applyTotals(copy);
      await copy.save();

      return reply.code(201).send({ document: serializeDocument(copy, requestToday(request)) });
    },
  );

  /** Converting an estimate creates a new draft that gets its own number. */
  app.post('/invoices/:id/convert', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:convert');

    const doc = await loadDocument(context, paramId(request));
    if (doc.docType !== 'estimate') {
      throw errors.validation([{ path: 'id', message: 'Only an estimate can be converted' }]);
    }

    const invoice = await scoped(Document, context).create({
      clientUuid: new Types.ObjectId().toString(),
      docType: 'invoice',
      status: 'draft',
      number: null,
      ...(doc.clientId ? { clientId: doc.clientId } : {}),
      ...(doc.clientSnapshot ? { clientSnapshot: doc.clientSnapshot } : {}),
      ...(doc.projectId ? { projectId: doc.projectId } : {}),
      items: (doc.items ?? []).map((item) => ({
        id: newLineItemId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
        ...(item.unit ? { unit: item.unit } : {}),
      })),
      currency: doc.currency,
      ...(doc.discount ? { discount: doc.discount } : {}),
      taxRateBp: doc.taxRateBp ?? 0,
      taxMode: doc.taxMode ?? 'added',
      ...(doc.reference ? { reference: doc.reference } : {}),
      ...(doc.notes ? { notes: doc.notes } : {}),
      ...(doc.terms ? { terms: doc.terms } : {}),
      source: 'estimate',
      convertedFrom: doc._id,
      createdBy: new Types.ObjectId(context.userId),
    });

    applyTotals(invoice);
    await invoice.save();

    return reply.code(201).send({ document: serializeDocument(invoice, requestToday(request)) });
  });

  /**
   * Applying a credit note records a payment. It can never exceed the invoice
   * balance or the credit left on the note; any remainder stays client credit.
   */
  app.post('/invoices/:id/apply-credit', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'creditNotes:apply');

    const invoice = await loadDocument(context, paramId(request));
    if (invoice.docType !== 'invoice') {
      throw errors.validation([{ path: 'id', message: 'Credit notes apply to invoices' }]);
    }
    if (invoice.status !== 'sent') {
      throw errors.conflict('This invoice cannot take a credit note');
    }

    const input = parseOrThrow(creditApplicationSchema, request.body ?? {});
    if (!Types.ObjectId.isValid(input.creditNoteId)) {
      throw errors.notFound();
    }
    const creditNote = await scoped(Document, context).findById(input.creditNoteId);
    if (!creditNote || creditNote.docType !== 'credit_note') {
      throw errors.notFound();
    }
    if (creditNote.status === 'draft' || creditNote.status === 'void') {
      throw errors.conflict('That credit note has not been issued');
    }
    if (!invoice.clientId || String(creditNote.clientId ?? '') !== String(invoice.clientId)) {
      throw errors.validation([
        {
          path: 'creditNoteId',
          message: 'The credit note and invoice must be for the same client',
        },
      ]);
    }
    if (creditNote.currency !== invoice.currency) {
      throw errors.validation([
        { path: 'creditNoteId', message: 'The credit note and invoice must use the same currency' },
      ]);
    }

    const withCredit = await scoped(Document, context).find({
      'payments.creditNoteId': creditNote._id,
    });
    const alreadyApplied = sumMinor(
      withCredit.flatMap((doc) =>
        (doc.payments ?? [])
          .filter((payment) => String(payment.creditNoteId ?? '') === String(creditNote._id))
          .map((payment) => payment.amount),
      ),
    );
    const creditTotal = creditNote.totals?.total ?? totalsFor(creditNote).total;
    const remainingCredit = creditTotal - alreadyApplied;
    if (remainingCredit <= 0) {
      throw errors.conflict('That credit note is fully applied');
    }

    const balance = totalsFor(invoice).balance;
    const requested = input.amount ?? Math.min(balance, remainingCredit);
    const applied = Math.min(requested, balance, remainingCredit);
    if (applied <= 0) {
      throw errors.validation([{ path: 'amount', message: 'There is nothing left to apply' }]);
    }

    invoice.payments.push({
      id: newLineItemId(),
      amount: applied,
      method: 'credit_note',
      paidAt: new Date().toISOString(),
      ...(creditNote.number ? { reference: creditNote.number } : {}),
      note: 'Credit applied',
      creditNoteId: creditNote._id,
      recordedBy: new Types.ObjectId(context.userId),
      recordedAt: new Date().toISOString(),
      settlesBalance: false,
    });

    applyTotals(invoice);
    if (totalsFor(invoice).balance === 0) {
      invoice.status = 'paid';
    }
    await invoice.save();

    return {
      document: serializeDocument(invoice, requestToday(request)),
      creditNote: {
        id: String(creditNote._id),
        number: creditNote.number ?? null,
        applied,
        remaining: remainingCredit - applied,
      },
    };
  });
};
