import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { recurringCreateSchema, recurringUpdateSchema } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Business } from '../models/business.js';
import { Document } from '../models/document.js';
import { RecurringInvoice } from '../models/recurringInvoice.js';
import { runRecurring, serializeSchedule, type RecurringDocument } from '../services/recurring.js';
import { requestToday } from '../services/documents.js';
import { scoped } from '../scoped.js';
import { requireAction, resolveTenant, type TenantContext } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface RecurringRouteOptions {
  config: ApiConfig;
}

function paramId(request: FastifyRequest): string {
  const id = (request.params as { id?: string }).id ?? '';
  if (!Types.ObjectId.isValid(id)) {
    throw errors.notFound();
  }
  return id;
}

function jobSecretMatches(request: FastifyRequest, config: ApiConfig): boolean {
  const raw = request.headers['x-job-secret'];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  return Boolean(config.jobSecret && provided && provided === config.jobSecret);
}

async function loadSchedule(context: TenantContext, id: string): Promise<RecurringDocument> {
  const schedule = (await scoped(RecurringInvoice, context).findById(
    id,
  )) as RecurringDocument | null;
  if (!schedule) {
    throw errors.notFound();
  }
  return schedule;
}

export const recurringRoutes: FastifyPluginAsync<RecurringRouteOptions> = async (
  app,
  { config },
) => {
  const authenticateRequest = authenticate(config);

  app.get('/recurring', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const schedules = (await scoped(RecurringInvoice, context).findSorted(
      {},
      { active: -1, nextRunAt: 1 },
      100,
    )) as unknown as RecurringDocument[];

    return { schedules: schedules.map(serializeSchedule) };
  });

  app.post('/recurring', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:create');

    const input = parseOrThrow(recurringCreateSchema, request.body ?? {});
    if (!Types.ObjectId.isValid(input.documentId)) {
      throw errors.notFound();
    }

    const source = await scoped(Document, context).findById(input.documentId);
    if (!source) {
      throw errors.notFound();
    }
    if (source.docType !== 'invoice') {
      throw errors.validation([{ path: 'documentId', message: 'Only an invoice can repeat' }]);
    }
    if ((source.items ?? []).length === 0) {
      throw errors.validation([{ path: 'documentId', message: 'That invoice has no lines' }]);
    }

    const business = await Business.findById(context.businessId);
    const today = requestToday(request);
    const startDate = input.startDate ?? today;

    if (input.endDate && input.endDate < startDate) {
      throw errors.validation([
        { path: 'endDate', message: 'The last date cannot be before the first' },
      ]);
    }

    const schedule = await RecurringInvoice.create({
      business: new Types.ObjectId(context.businessId),
      sourceDocumentId: source._id,
      ...(source.clientId ? { clientId: source.clientId } : {}),
      ...(source.clientSnapshot ? { clientSnapshot: source.clientSnapshot } : {}),
      items: source.items ?? [],
      currency: source.currency,
      ...(source.discount ? { discount: source.discount } : {}),
      taxRateBp: source.taxRateBp ?? 0,
      taxMode: source.taxMode ?? 'added',
      ...(source.notes ? { notes: source.notes } : {}),
      ...(source.terms ? { terms: source.terms } : {}),
      interval: input.interval,
      intervalCount: input.intervalCount,
      startDate,
      ...(input.endDate ? { endDate: input.endDate } : {}),
      nextRunAt: startDate,
      dueDays: input.dueDays ?? business?.dueDays ?? 14,
      active: true,
      createdBy: new Types.ObjectId(context.userId),
    });

    return reply.code(201).send({ schedule: serializeSchedule(schedule as RecurringDocument) });
  });

  app.get('/recurring/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');
    return { schedule: serializeSchedule(await loadSchedule(context, paramId(request))) };
  });

  app.put('/recurring/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:create');

    const schedule = await loadSchedule(context, paramId(request));
    const input = parseOrThrow(recurringUpdateSchema, request.body ?? {});
    const today = requestToday(request);

    if (input.interval !== undefined) schedule.interval = input.interval;
    if (input.intervalCount !== undefined) schedule.intervalCount = input.intervalCount;
    if (input.dueDays !== undefined) schedule.dueDays = input.dueDays;

    if (input.endDate !== undefined) {
      if (input.endDate !== null && input.endDate < schedule.startDate) {
        throw errors.validation([
          { path: 'endDate', message: 'The last date cannot be before the first' },
        ]);
      }
      schedule.endDate = input.endDate ?? undefined;
    }

    if (input.active !== undefined) {
      schedule.active = input.active;
      // Resuming after a pause must not backfill every missed month at once.
      if (input.active && schedule.nextRunAt < today) {
        schedule.nextRunAt = today;
      }
    }

    await schedule.save();
    return { schedule: serializeSchedule(schedule) };
  });

  app.delete('/recurring/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:create');

    const schedule = await loadSchedule(context, paramId(request));
    await schedule.deleteOne();
    return reply.code(204).send();
  });

  /**
   * The daily job (x-job-secret) runs every business; a signed-in user runs only
   * their own. Safe to call on every app open: a schedule either has a row for an
   * occurrence or it has not run yet.
   */
  app.post(
    '/recurring/run',
    {
      preHandler: async (request) => {
        if (jobSecretMatches(request, config)) return;
        await authenticateRequest(request);
      },
    },
    async (request) => {
      const today = requestToday(request);
      const isJob = jobSecretMatches(request, config);

      if (isJob) {
        return runRecurring({ today });
      }

      const context = await resolveTenant(request);
      requireAction(context, 'drafts:create');
      return runRecurring({ businessId: context.businessId, today });
    },
  );
};
