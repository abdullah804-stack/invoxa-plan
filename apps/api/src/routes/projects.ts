import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types, type HydratedDocument } from 'mongoose';
import {
  addDays,
  billTimeSchema,
  projectInputSchema,
  projectListQuerySchema,
  projectUpdateSchema,
  roundMinutes,
  timeEntryInputSchema,
  timeEntryListQuerySchema,
  timeEntryUpdateSchema,
  timerStartSchema,
  type DocumentType,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Business } from '../models/business.js';
import { Client } from '../models/client.js';
import { Document, type DocumentRecord } from '../models/document.js';
import { Project, TimeEntry, type ProjectRecord, type TimeEntryRecord } from '../models/project.js';
import { Timer } from '../models/timer.js';
import {
  applyTotals,
  buildClientSnapshot,
  newLineItemId,
  requestToday,
  serializeDocument,
} from '../services/documents.js';
import { logActivity } from '../services/activity.js';
import { scoped } from '../scoped.js';
import { requireAction, resolveTenant, type TenantContext } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ProjectRouteOptions {
  config: ApiConfig;
}

type ProjectDocument = HydratedDocument<ProjectRecord>;
type TimeEntryDocument = HydratedDocument<TimeEntryRecord>;

function paramId(request: FastifyRequest, key = 'id'): string {
  const id = (request.params as Record<string, string | undefined>)[key] ?? '';
  if (!Types.ObjectId.isValid(id)) {
    throw errors.notFound();
  }
  return id;
}

function serializeProject(project: ProjectDocument, clientName: string | null) {
  return {
    id: String(project._id),
    name: project.name,
    clientId: project.clientId ? String(project.clientId) : null,
    clientName,
    status: project.status,
    currency: project.currency,
    hourlyRateMinor: project.hourlyRateMinor ?? null,
    budgetMinor: project.budgetMinor ?? null,
    startDate: project.startDate ?? null,
    dueDate: project.dueDate ?? null,
    notes: project.notes ?? null,
    createdAt: (project.createdAt as Date | undefined)?.toISOString() ?? new Date().toISOString(),
  };
}

function serializeTimeEntry(entry: TimeEntryDocument) {
  return {
    id: String(entry._id),
    projectId: String(entry.projectId),
    date: entry.date,
    minutes: entry.minutes,
    description: entry.description,
    hourlyRateMinor: entry.hourlyRateMinor,
    currency: entry.currency,
    billable: entry.billable ?? true,
    billedDocumentId: entry.billedDocumentId ? String(entry.billedDocumentId) : null,
    createdAt: (entry.createdAt as Date | undefined)?.toISOString() ?? new Date().toISOString(),
  };
}

/** Minutes to money at an hourly rate, rounded once at the end. */
export function valueOfMinutes(minutes: number, hourlyRateMinor: number): number {
  return Math.round((minutes / 60) * hourlyRateMinor);
}

function timeTotals(entries: TimeEntryRecord[]) {
  let minutes = 0;
  let billableMinutes = 0;
  let unbilledMinutes = 0;
  let valueMinor = 0;
  let unbilledValueMinor = 0;

  for (const entry of entries) {
    minutes += entry.minutes;
    valueMinor += valueOfMinutes(entry.minutes, entry.hourlyRateMinor);
    if (entry.billable) {
      billableMinutes += entry.minutes;
      if (!entry.billedDocumentId) {
        unbilledMinutes += entry.minutes;
        unbilledValueMinor += valueOfMinutes(entry.minutes, entry.hourlyRateMinor);
      }
    }
  }

  return { minutes, billableMinutes, unbilledMinutes, valueMinor, unbilledValueMinor };
}

type TimerDocument = HydratedDocument<{
  projectId: Types.ObjectId;
  description?: string | null;
  startedAt: Date;
}>;

function serializeTimer(
  timer: TimerDocument,
  project: ProjectDocument,
  now = Date.now(),
): Record<string, unknown> {
  return {
    id: String(timer._id),
    projectId: String(timer.projectId),
    projectName: project.name,
    description: timer.description ?? null,
    startedAt: timer.startedAt.toISOString(),
    elapsedMinutes: Math.max(0, Math.floor((now - timer.startedAt.getTime()) / 60_000)),
  };
}

async function loadProject(context: TenantContext, id: string): Promise<ProjectDocument> {
  const project = (await scoped(Project, context).findById(id)) as ProjectDocument | null;
  if (!project) {
    throw errors.notFound();
  }
  return project;
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

export const projectRoutes: FastifyPluginAsync<ProjectRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/projects', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'projects:read');

    const query = parseOrThrow(projectListQuerySchema, request.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;
    if (query.clientId) {
      if (!Types.ObjectId.isValid(query.clientId)) throw errors.notFound();
      filter['clientId'] = new Types.ObjectId(query.clientId);
    }

    const projects = (await scoped(Project, context).findSorted(
      filter,
      { updatedAt: -1 },
      query.limit,
    )) as unknown as ProjectDocument[];

    const clientIds = projects
      .map((project) => project.clientId)
      .filter((value): value is Types.ObjectId => Boolean(value));
    const clients = await scoped(Client, context).find({ _id: { $in: clientIds } }, 200);
    const names = new Map(clients.map((client) => [String(client._id), client.name]));

    return {
      projects: projects.map((project) =>
        serializeProject(
          project,
          project.clientId ? (names.get(String(project.clientId)) ?? null) : null,
        ),
      ),
    };
  });

  app.post('/projects', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const input = parseOrThrow(projectInputSchema, request.body ?? {});
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
      throw errors.validation([
        { path: 'dueDate', message: 'Due date cannot be before the start' },
      ]);
    }
    const client = await optionalClient(context, input.clientId);

    const project = (await scoped(Project, context).create({
      ...input,
      ...(client ? { clientId: client._id } : {}),
      createdBy: new Types.ObjectId(context.userId),
    })) as ProjectDocument;

    return reply.code(201).send({ project: serializeProject(project, client?.name ?? null) });
  });

  app.get('/projects/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'projects:read');

    const project = await loadProject(context, paramId(request));
    const client = project.clientId
      ? await scoped(Client, context).findById(String(project.clientId))
      : null;
    const entries = (await scoped(TimeEntry, context).findSorted(
      { projectId: project._id },
      { date: -1 },
      200,
    )) as unknown as TimeEntryDocument[];
    const documents = await scoped(Document, context).findSorted(
      { projectId: project._id },
      { createdAt: -1 },
      50,
    );
    const today = requestToday(request);

    return {
      project: serializeProject(project, client?.name ?? null),
      time: { ...timeTotals(entries as unknown as TimeEntryRecord[]) },
      entries: entries.map(serializeTimeEntry),
      documents: documents.map((doc) => ({
        id: String(doc._id),
        number: doc.number ?? null,
        docType: doc.docType as DocumentType,
        status: doc.status,
        issueDate: doc.issueDate ?? null,
        currency: doc.currency,
        total: doc.totals?.total ?? 0,
        paid: doc.totals?.paid ?? 0,
        dueDate: doc.dueDate ?? null,
        createdAt: (doc.createdAt as Date | undefined)?.toISOString() ?? today,
      })),
    };
  });

  app.put('/projects/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const project = await loadProject(context, paramId(request));
    const input = parseOrThrow(projectUpdateSchema, request.body ?? {});

    if (input.clientId !== undefined) {
      const client = await optionalClient(context, input.clientId);
      project.clientId = client ? client._id : undefined;
    }
    for (const [key, value] of Object.entries(input)) {
      if (key === 'clientId' || value === undefined) continue;
      (project as unknown as Record<string, unknown>)[key] = value;
    }

    if (project.startDate && project.dueDate && project.dueDate < project.startDate) {
      throw errors.validation([
        { path: 'dueDate', message: 'Due date cannot be before the start' },
      ]);
    }

    await project.save();
    const client = project.clientId
      ? await scoped(Client, context).findById(String(project.clientId))
      : null;
    return { project: serializeProject(project, client?.name ?? null) };
  });

  app.delete('/projects/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const project = await loadProject(context, paramId(request));
    const [entryCount, documentCount] = await Promise.all([
      scoped(TimeEntry, context).count({ projectId: project._id }),
      scoped(Document, context).count({ projectId: project._id }),
    ]);
    if (entryCount > 0 || documentCount > 0) {
      throw errors.conflict('Archive a project that has time or invoices');
    }

    await project.deleteOne();
    return reply.code(204).send();
  });

  app.get('/time-entries', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'projects:read');

    const query = parseOrThrow(timeEntryListQuerySchema, request.query);
    const filter: Record<string, unknown> = {};
    if (query.projectId) {
      if (!Types.ObjectId.isValid(query.projectId)) throw errors.notFound();
      filter['projectId'] = new Types.ObjectId(query.projectId);
    }
    if (query.from || query.to) {
      filter['date'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.unbilled === 'true') {
      filter['billedDocumentId'] = { $exists: false };
      filter['billable'] = true;
    }

    const entries = (await scoped(TimeEntry, context).findSorted(
      filter,
      { date: -1, createdAt: -1 },
      query.limit,
    )) as unknown as TimeEntryDocument[];

    return {
      entries: entries.map(serializeTimeEntry),
      totals: timeTotals(entries as unknown as TimeEntryRecord[]),
    };
  });

  app.post('/time-entries', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    const input = parseOrThrow(timeEntryInputSchema, request.body ?? {});
    const project = await loadProject(context, input.projectId);

    const entry = await scoped(TimeEntry, context).create({
      projectId: project._id,
      date: input.date,
      minutes: input.minutes,
      description: input.description,
      hourlyRateMinor: input.hourlyRateMinor,
      currency: project.currency,
      billable: input.billable,
      createdBy: new Types.ObjectId(context.userId),
    });

    await logActivity(context, {
      type: 'time.logged',
      summary: `Logged ${input.minutes} minutes on ${project.name}`,
      entityId: String(entry._id),
      entityLabel: project.name,
    });

    return reply.code(201).send({ entry: serializeTimeEntry(entry as TimeEntryDocument) });
  });

  app.put('/time-entries/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    const entry = (await scoped(TimeEntry, context).findById(
      paramId(request),
    )) as TimeEntryDocument | null;
    if (!entry) throw errors.notFound();
    if (entry.billedDocumentId) {
      throw errors.conflict('That time is already on an invoice');
    }

    const input = parseOrThrow(timeEntryUpdateSchema, request.body ?? {});
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        (entry as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (input.hourlyRateMinor !== undefined) {
      entry.currency = (await loadProject(context, String(entry.projectId))).currency;
    }
    await entry.save();

    return { entry: serializeTimeEntry(entry) };
  });

  app.delete('/time-entries/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    const entry = (await scoped(TimeEntry, context).findById(
      paramId(request),
    )) as TimeEntryDocument | null;
    if (!entry) throw errors.notFound();
    if (entry.billedDocumentId) {
      throw errors.conflict('That time is already on an invoice');
    }

    await entry.deleteOne();
    return reply.code(204).send();
  });

  /**
   * Turns a project's unbilled billable time into one draft invoice: lines are
   * grouped by description and rate, entries are marked with the draft they went
   * onto, and deleting that draft releases them again.
   */
  app.post('/projects/:id/bill', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');
    requireAction(context, 'drafts:create');

    const project = await loadProject(context, paramId(request));
    const input = parseOrThrow(billTimeSchema, request.body ?? {});
    const entries = (await scoped(TimeEntry, context).findSorted(
      { projectId: project._id, billable: true, billedDocumentId: { $exists: false } },
      { date: 1, createdAt: 1 },
      500,
    )) as unknown as TimeEntryDocument[];

    if (entries.length === 0) {
      throw errors.validation([], 'There is no unbilled time on this project');
    }

    const business = await Business.findById(context.businessId);
    const today = requestToday(request);

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

    const client = project.clientId
      ? await scoped(Client, context).findById(String(project.clientId))
      : null;

    const doc = new Document({
      business: new Types.ObjectId(context.businessId),
      clientUuid: `time-${String(project._id)}-${Date.now()}`,
      docType: 'invoice',
      status: 'draft',
      number: null,
      ...(client ? { clientId: client._id, clientSnapshot: buildClientSnapshot(client) } : {}),
      projectId: project._id,
      items: [...groups.values()].map((group) => ({
        id: newLineItemId(),
        description: group.description,
        quantity: Math.round((group.minutes / 60) * 1000) / 1000,
        unitPrice: group.rate,
        unit: 'hours',
        timeEntryIds: group.ids,
      })),
      currency: project.currency,
      taxRateBp: business?.taxRateBp ?? 0,
      taxMode: business?.taxMode ?? 'added',
      issueDate: today,
      dueDate: addDays(today, input.dueDays ?? business?.dueDays ?? 14),
      source: 'time',
      createdBy: new Types.ObjectId(context.userId),
    }) as unknown as HydratedDocument<DocumentRecord>;

    applyTotals(doc);
    await doc.save();

    await TimeEntry.updateMany(
      { _id: { $in: entries.map((entry) => entry._id) } },
      { $set: { billedDocumentId: doc._id } },
    );

    return {
      document: serializeDocument(doc, today),
      billedMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
      entries: entries.length,
    };
  });

  /** One running timer per person, stored here so a phone restart cannot lose it. */
  app.get('/timer', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'projects:read');

    const timer = (await scoped(Timer, context).findOne({
      user: new Types.ObjectId(context.userId),
    })) as TimerDocument | null;
    if (!timer) return { timer: null };

    const project = (await scoped(Project, context).findById(
      String(timer.projectId),
    )) as ProjectDocument | null;
    if (!project) return { timer: null };

    return { timer: serializeTimer(timer, project) };
  });

  app.post('/timer/start', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    const input = parseOrThrow(timerStartSchema, request.body ?? {});
    const project = await loadProject(context, input.projectId);
    const running = await scoped(Timer, context).findOne({
      user: new Types.ObjectId(context.userId),
    });
    if (running) {
      throw errors.conflict('A timer is already running. Stop it first.');
    }

    const timer = (await scoped(Timer, context).create({
      user: new Types.ObjectId(context.userId),
      projectId: project._id,
      ...(input.description ? { description: input.description } : {}),
      startedAt: new Date(),
    })) as unknown as TimerDocument;

    return reply.code(201).send({ timer: serializeTimer(timer, project) });
  });

  /**
   * Stopping banks the elapsed time as one ordinary time entry. The business
   * rounding setting decides whether minutes become 5 or 15 minute blocks.
   */
  app.post('/timer/stop', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    const timer = (await scoped(Timer, context).findOne({
      user: new Types.ObjectId(context.userId),
    })) as TimerDocument | null;
    if (!timer) {
      throw errors.conflict('No timer is running');
    }

    const project = await loadProject(context, String(timer.projectId));
    const business = await Business.findById(context.businessId);
    const elapsed = Math.max(0, Math.floor((Date.now() - timer.startedAt.getTime()) / 60_000));
    const minutes = roundMinutes(elapsed, business?.timeRounding ?? 'none');

    const entry = await scoped(TimeEntry, context).create({
      projectId: project._id,
      date: requestToday(request),
      minutes,
      description: timer.description?.trim() || project.name,
      hourlyRateMinor: project.hourlyRateMinor ?? 0,
      currency: project.currency,
      billable: true,
      createdBy: new Types.ObjectId(context.userId),
    });

    await timer.deleteOne();

    return { entry: serializeTimeEntry(entry as TimeEntryDocument), minutes };
  });

  app.delete('/timer', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'time:write');

    await Timer.deleteOne({
      business: new Types.ObjectId(context.businessId),
      user: new Types.ObjectId(context.userId),
    });
    return reply.code(204).send();
  });
};
