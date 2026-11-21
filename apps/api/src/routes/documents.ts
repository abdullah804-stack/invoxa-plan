import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types, type FilterQuery } from 'mongoose';
import {
  addDays,
  assertPaymentAllowed,
  can,
  canTransition,
  documentInputSchema,
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
import { assignDocumentNumber } from '../services/numbering.js';
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

    const doc = await documents.create({
      clientUuid: input.clientUuid,
      docType: input.docType,
      status: 'draft',
      number: null,
      ...(client ? { clientId: client._id } : {}),
      ...(clientSnapshot ? { clientSnapshot } : {}),
      ...(optionalObjectId(input.projectId)
        ? { projectId: optionalObjectId(input.projectId) }
        : {}),
      items: input.items.map((item) => ({
        id: item.id ?? newLineItemId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
        ...(item.unit ? { unit: item.unit } : {}),
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

    applyTotals(doc);
    await doc.save();

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
    if (input.items !== undefined) {
      doc.items = input.items.map((item) => ({
        id: item.id ?? newLineItemId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
        ...(item.unit ? { unit: item.unit } : {}),
      })) as typeof doc.items;
    }
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
    if (input.projectId !== undefined) doc.projectId = optionalObjectId(input.projectId);

    assertDates(doc.issueDate ?? undefined, doc.dueDate ?? undefined);
    applyTotals(doc);
    await doc.save();

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

    await doc.deleteOne();
    return reply.code(204).send();
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
