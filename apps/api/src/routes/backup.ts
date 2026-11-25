import type { FastifyPluginAsync } from 'fastify';
import { Types, type FilterQuery, type HydratedDocument } from 'mongoose';
import { BACKUP_VERSION, backupSchema, normalizeNameKey } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { LOGO_MAX_BYTES, SIGNATURE_MAX_BYTES, parseImageDataUrl } from '../brandAssets.js';
import { BrandAsset } from '../models/brandAsset.js';
import { Business } from '../models/business.js';
import { Client } from '../models/client.js';
import { Document } from '../models/document.js';
import { Expense } from '../models/expense.js';
import { Project, TimeEntry } from '../models/project.js';
import { RecurringInvoice } from '../models/recurringInvoice.js';
import { SavedItem } from '../models/savedItem.js';
import { scoped, type ScopedRepository } from '../scoped.js';
import { logActivity } from '../services/activity.js';
import {
  applyBusinessUpdate,
  serializeBusiness,
  type BusinessUpdate,
} from '../services/business.js';
import {
  applyTotals,
  buildBrandSnapshot,
  newLineItemId,
  requestToday,
} from '../services/documents.js';
import { assignDocumentNumber } from '../services/numbering.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface BackupRouteOptions {
  config: ApiConfig;
}

/** A backup with images and receipts needs more room than a normal request. */
const BACKUP_BODY_LIMIT = 8 * 1024 * 1024;
/** Rows read per query while a backup walks a collection. */
const SCAN_BATCH = 500;
/** Copying a whole business is heavier than a normal request, so it is capped lower. */
const BACKUP_EXPORT_LIMIT = { max: 20, timeWindow: '1 minute' };
const BACKUP_RESTORE_LIMIT = { max: 10, timeWindow: '1 minute' };

/**
 * The app marks each upload with its part number, so a restore sent in parts
 * writes one activity row for the whole restore rather than one per request.
 * The marker is not part of the file's schema and is dropped by validation.
 */
function backupPart(body: unknown): { index: number; total: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const part = (body as { part?: unknown }).part;
  if (typeof part !== 'object' || part === null) return null;
  const { index, total } = part as { index?: unknown; total?: unknown };
  if (typeof index !== 'number' || typeof total !== 'number') return null;
  if (!Number.isInteger(index) || !Number.isInteger(total)) return null;
  if (index < 1 || total < 1 || index > total || total > 1000) return null;
  return { index, total };
}

/**
 * Every row in a collection, in _id order. A backup must never stop at a page
 * boundary: passing a limit to find() is what silently dropped every record
 * past the first 2,000, so this keeps reading until no rows remain.
 */
async function findAll<TDoc>(
  repository: ScopedRepository<TDoc>,
): Promise<HydratedDocument<TDoc>[]> {
  const rows: HydratedDocument<TDoc>[] = [];
  let after: unknown = null;

  for (;;) {
    const filter = (after === null ? {} : { _id: { $gt: after } }) as FilterQuery<TDoc>;
    const batch = await repository.findSorted(filter, { _id: 1 }, SCAN_BATCH);
    rows.push(...batch);
    if (batch.length < SCAN_BATCH) return rows;
    after = (batch[batch.length - 1] as unknown as { _id: unknown })._id;
  }
}

export const backupRoutes: FastifyPluginAsync<BackupRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /**
   * A full copy of the active business: settings, brand images, clients,
   * projects, documents with their payments, recurring schedules, expenses,
   * tracked time and saved items. Every collection is read to its end, so the
   * file holds the whole business rather than its first page. The file is the
   * same JSON the restore endpoint accepts.
   */
  app.get(
    '/backup',
    { preHandler: authenticateRequest, config: { rateLimit: BACKUP_EXPORT_LIMIT } },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'backup:export');

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const [clients, projects, documents, expenses, timeEntries, savedItems, recurring] =
        await Promise.all([
          findAll(scoped(Client, context)),
          findAll(scoped(Project, context)),
          findAll(scoped(Document, context)),
          findAll(scoped(Expense, context)),
          findAll(scoped(TimeEntry, context)),
          findAll(scoped(SavedItem, context)),
          findAll(scoped(RecurringInvoice, context)),
        ]);

      const projectNames = new Map(projects.map((project) => [String(project._id), project.name]));
      const clientNames = new Map(clients.map((client) => [String(client._id), client.name]));
      // A schedule points at its source invoice by device ID, which a restore can
      // find again after that invoice is written into another business.
      const clientUuidByDocumentId = new Map(
        documents.map((document) => [String(document._id), document.clientUuid]),
      );
      const assets = await BrandAsset.find({ business: context.businessId });

      const profile = serializeBusiness(business);
      const logo = assets.find((asset) => String(asset._id) === profile.branding.logoAssetId);
      const signature = assets.find(
        (asset) => String(asset._id) === profile.branding.signatureAssetId,
      );

      return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        business: {
          name: profile.name,
          contactName: profile.contactName ?? undefined,
          email: profile.email ?? undefined,
          phone: profile.phone ?? undefined,
          address: profile.address ?? undefined,
          taxId: profile.taxId ?? undefined,
          website: profile.website ?? undefined,
          currency: profile.currency,
          language: profile.language,
          pageSize: profile.pageSize,
          taxRateBp: profile.taxRateBp,
          taxMode: profile.taxMode,
          dueDays: profile.dueDays,
          timeRounding: profile.timeRounding,
          branding: {
            color: profile.branding.color,
            template: profile.branding.template,
            fontPair: profile.branding.fontPair,
            headerLayout: profile.branding.headerLayout,
          },
          payment: {
            ...(profile.payment.instructions ? { instructions: profile.payment.instructions } : {}),
            ...(profile.payment.link ? { link: profile.payment.link } : {}),
          },
          numbering: profile.numbering,
          taxPresets: profile.taxPresets.map((preset) => ({
            name: preset.name,
            rateBp: preset.rateBp,
            ...(preset.checkedOn ? { checkedOn: preset.checkedOn } : {}),
            ...(preset.note ? { note: preset.note } : {}),
          })),
          lateFee: profile.lateFee,
          reminders: profile.reminders,
        },
        brandAssets: {
          ...(logo ? { logo: logo.dataUrl } : {}),
          ...(signature ? { signature: signature.dataUrl } : {}),
        },
        clients: clients.map((client) => ({
          name: client.name,
          ...(client.email ? { email: client.email } : {}),
          ...(client.phone ? { phone: client.phone } : {}),
          ...(client.address ? { address: client.address } : {}),
          ...(client.taxId ? { taxId: client.taxId } : {}),
          ...(client.notes ? { notes: client.notes } : {}),
          archived: client.archived ?? false,
        })),
        projects: projects.map((project) => ({
          name: project.name,
          ...(project.clientId ? { clientName: clientNames.get(String(project.clientId)) } : {}),
          status: project.status,
          currency: project.currency,
          ...(project.hourlyRateMinor !== undefined && project.hourlyRateMinor !== null
            ? { hourlyRateMinor: project.hourlyRateMinor }
            : {}),
          ...(project.budgetMinor !== undefined && project.budgetMinor !== null
            ? { budgetMinor: project.budgetMinor }
            : {}),
          ...(project.startDate ? { startDate: project.startDate } : {}),
          ...(project.dueDate ? { dueDate: project.dueDate } : {}),
          ...(project.notes ? { notes: project.notes } : {}),
        })),
        documents: documents.map((doc) => ({
          clientUuid: doc.clientUuid,
          docType: doc.docType,
          status: doc.status,
          ...(doc.clientSnapshot?.name ? { clientName: doc.clientSnapshot.name } : {}),
          ...(doc.clientSnapshot
            ? {
                clientSnapshot: {
                  name: doc.clientSnapshot.name,
                  ...(doc.clientSnapshot.email ? { email: doc.clientSnapshot.email } : {}),
                  ...(doc.clientSnapshot.phone ? { phone: doc.clientSnapshot.phone } : {}),
                  ...(doc.clientSnapshot.address ? { address: doc.clientSnapshot.address } : {}),
                  ...(doc.clientSnapshot.taxId ? { taxId: doc.clientSnapshot.taxId } : {}),
                },
              }
            : {}),
          items: (doc.items ?? []).map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            ...(item.discountBp !== undefined && item.discountBp !== null
              ? { discountBp: item.discountBp }
              : {}),
            ...(item.unit ? { unit: item.unit } : {}),
          })),
          currency: doc.currency,
          discount:
            doc.discount?.type === 'percent'
              ? { type: 'percent' as const, valueBp: doc.discount.valueBp ?? 0 }
              : doc.discount?.type === 'fixed'
                ? { type: 'fixed' as const, valueMinor: doc.discount.valueMinor ?? 0 }
                : null,
          taxRateBp: doc.taxRateBp ?? 0,
          taxMode: doc.taxMode ?? 'added',
          ...(doc.issueDate ? { issueDate: doc.issueDate } : {}),
          ...(doc.dueDate ? { dueDate: doc.dueDate } : {}),
          ...(doc.validUntil ? { validUntil: doc.validUntil } : {}),
          ...(doc.reference ? { reference: doc.reference } : {}),
          ...(doc.notes ? { notes: doc.notes } : {}),
          ...(doc.terms ? { terms: doc.terms } : {}),
          ...(doc.source ? { source: doc.source } : {}),
          payments: (doc.payments ?? []).map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            method: payment.method,
            paidAt: payment.paidAt,
            ...(payment.reference ? { reference: payment.reference } : {}),
            ...(payment.note ? { note: payment.note } : {}),
            settlesBalance: payment.settlesBalance ?? false,
          })),
          adjustments: (doc.adjustments ?? []).map((adjustment) => ({
            id: adjustment.id,
            type: 'late_fee' as const,
            amount: adjustment.amount,
            ...(adjustment.basisPoints !== undefined && adjustment.basisPoints !== null
              ? { basisPoints: adjustment.basisPoints }
              : {}),
            appliedAt: adjustment.appliedAt,
            ...(adjustment.effectiveDate ? { effectiveDate: adjustment.effectiveDate } : {}),
          })),
        })),
        recurring: recurring.map((schedule) => ({
          ...(clientUuidByDocumentId.get(String(schedule.sourceDocumentId))
            ? { sourceClientUuid: clientUuidByDocumentId.get(String(schedule.sourceDocumentId)) }
            : {}),
          ...(schedule.clientSnapshot
            ? {
                clientSnapshot: {
                  name: schedule.clientSnapshot.name,
                  ...(schedule.clientSnapshot.email
                    ? { email: schedule.clientSnapshot.email }
                    : {}),
                  ...(schedule.clientSnapshot.phone
                    ? { phone: schedule.clientSnapshot.phone }
                    : {}),
                  ...(schedule.clientSnapshot.address
                    ? { address: schedule.clientSnapshot.address }
                    : {}),
                  ...(schedule.clientSnapshot.taxId
                    ? { taxId: schedule.clientSnapshot.taxId }
                    : {}),
                },
              }
            : {}),
          items: (schedule.items ?? []).map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            ...(item.discountBp !== undefined && item.discountBp !== null
              ? { discountBp: item.discountBp }
              : {}),
            ...(item.unit ? { unit: item.unit } : {}),
          })),
          currency: schedule.currency,
          discount:
            schedule.discount?.type === 'percent'
              ? { type: 'percent' as const, valueBp: schedule.discount.valueBp ?? 0 }
              : schedule.discount?.type === 'fixed'
                ? { type: 'fixed' as const, valueMinor: schedule.discount.valueMinor ?? 0 }
                : null,
          taxRateBp: schedule.taxRateBp ?? 0,
          taxMode: schedule.taxMode ?? 'added',
          ...(schedule.notes ? { notes: schedule.notes } : {}),
          ...(schedule.terms ? { terms: schedule.terms } : {}),
          interval: schedule.interval,
          intervalCount: schedule.intervalCount ?? 1,
          startDate: schedule.startDate,
          ...(schedule.endDate ? { endDate: schedule.endDate } : {}),
          nextRunAt: schedule.nextRunAt,
          dueDays: schedule.dueDays ?? 14,
          active: schedule.active ?? true,
        })),
        expenses: expenses.map((expense) => ({
          date: expense.date,
          category: expense.category,
          description: expense.description,
          ...(expense.vendor ? { vendor: expense.vendor } : {}),
          amount: expense.amount,
          currency: expense.currency,
          ...(expense.taxMinor !== undefined && expense.taxMinor !== null
            ? { taxMinor: expense.taxMinor }
            : {}),
          ...(expense.notes ? { notes: expense.notes } : {}),
          billable: expense.billable ?? false,
        })),
        timeEntries: timeEntries.map((entry) => ({
          projectName: projectNames.get(String(entry.projectId)) ?? 'Unknown project',
          date: entry.date,
          minutes: entry.minutes,
          description: entry.description,
          hourlyRateMinor: entry.hourlyRateMinor,
          currency: entry.currency,
          billable: entry.billable ?? true,
        })),
        savedItems: savedItems.map((item) => ({
          description: item.description,
          unitPrice: item.unitPrice,
          currency: item.currency,
        })),
      };
    },
  );

  /**
   * The same validation the restore runs, without writing: what the file holds
   * and how much of it this business already has.
   */
  app.post(
    '/backup/preview',
    {
      preHandler: authenticateRequest,
      bodyLimit: BACKUP_BODY_LIMIT,
      config: { rateLimit: BACKUP_RESTORE_LIMIT },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'backup:restore');

      const input = parseOrThrow(backupSchema, request.body ?? {});
      const uuids = input.documents.map((doc) => doc.clientUuid);
      const existing =
        uuids.length > 0
          ? await scoped(Document, context).count({ clientUuid: { $in: uuids } })
          : 0;

      return {
        counts: {
          clients: input.clients.length,
          projects: input.projects.length,
          documents: input.documents.length,
          expenses: input.expenses.length,
          timeEntries: input.timeEntries.length,
          savedItems: input.savedItems.length,
          recurring: input.recurring.length,
        },
        existingDocuments: existing,
        exportedAt: input.exportedAt ?? null,
      };
    },
  );

  /**
   * Restore merges rather than replaces. Clients and projects match by name,
   * documents by clientUuid, and expenses, time and saved items by their
   * contents, so running the same file twice adds nothing twice. Restored
   * documents get a fresh number from this business's series and their totals
   * are recomputed from the lines and payments, never trusted from the file.
   */
  app.post(
    '/backup/restore',
    {
      preHandler: authenticateRequest,
      bodyLimit: BACKUP_BODY_LIMIT,
      config: { rateLimit: BACKUP_RESTORE_LIMIT },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'backup:restore');

      const input = parseOrThrow(backupSchema, request.body ?? {});
      const part = backupPart(request.body);
      const lastPart = !part || part.index === part.total;

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const restored = {
        clients: 0,
        projects: 0,
        documents: 0,
        expenses: 0,
        timeEntries: 0,
        savedItems: 0,
        recurring: 0,
      };
      const skipped = {
        documents: 0,
        expenses: 0,
        timeEntries: 0,
        savedItems: 0,
        recurring: 0,
      };

      // Clients first: everything else may point at them.
      const clients = scoped(Client, context);
      const clientByName = new Map(
        (await findAll(clients)).map((client) => [client.nameKey, client]),
      );
      for (const row of input.clients) {
        const nameKey = normalizeNameKey(row.name);
        if (clientByName.has(nameKey)) continue;
        const created = await clients.create({
          name: row.name,
          nameKey,
          ...(row.email ? { email: row.email } : {}),
          ...(row.phone ? { phone: row.phone } : {}),
          ...(row.address ? { address: row.address } : {}),
          ...(row.taxId ? { taxId: row.taxId } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
          archived: row.archived,
        });
        clientByName.set(nameKey, created);
        restored.clients += 1;
      }

      const projects = scoped(Project, context);
      const projectByName = new Map(
        (await findAll(projects)).map((project) => [project.name, project]),
      );
      for (const row of input.projects) {
        if (projectByName.has(row.name)) continue;
        const client = row.clientName
          ? clientByName.get(normalizeNameKey(row.clientName))
          : undefined;
        const created = await projects.create({
          name: row.name,
          ...(client ? { clientId: client._id } : {}),
          status: row.status,
          currency: row.currency,
          ...(row.hourlyRateMinor !== undefined ? { hourlyRateMinor: row.hourlyRateMinor } : {}),
          ...(row.budgetMinor !== undefined ? { budgetMinor: row.budgetMinor } : {}),
          ...(row.startDate ? { startDate: row.startDate } : {}),
          ...(row.dueDate ? { dueDate: row.dueDate } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
          createdBy: new Types.ObjectId(context.userId),
        });
        projectByName.set(row.name, created);
        restored.projects += 1;
      }

      const documents = scoped(Document, context);
      // Beyond the first page too: a business with more than 2,000 documents
      // must still recognise a file it already imported.
      const documentIdByClientUuid = new Map<string, string>();
      for (const existing of await findAll(documents)) {
        documentIdByClientUuid.set(existing.clientUuid, String(existing._id));
      }
      const today = requestToday(request);
      const brandSnapshot = buildBrandSnapshot(business);

      for (const row of input.documents) {
        if (documentIdByClientUuid.has(row.clientUuid)) {
          skipped.documents += 1;
          continue;
        }

        const client = row.clientName
          ? clientByName.get(normalizeNameKey(row.clientName))
          : undefined;
        const clientSnapshot = row.clientSnapshot ?? (client ? { name: client.name } : undefined);

        const doc = await documents.create({
          clientUuid: row.clientUuid,
          docType: row.docType,
          status: row.status,
          // Drafts stay unnumbered; everything else rejoins this series.
          number:
            row.status === 'draft'
              ? null
              : await assignDocumentNumber(context.businessId, row.docType),
          ...(client ? { clientId: client._id } : {}),
          ...(clientSnapshot ? { clientSnapshot } : {}),
          items: row.items.map((item) => ({
            id: item.id ?? newLineItemId(),
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
            ...(item.unit ? { unit: item.unit } : {}),
          })),
          currency: row.currency,
          ...(row.discount
            ? {
                discount:
                  row.discount.type === 'percent'
                    ? { type: 'percent', valueBp: row.discount.valueBp }
                    : { type: 'fixed', valueMinor: row.discount.valueMinor },
              }
            : {}),
          taxRateBp: row.taxRateBp,
          taxMode: row.taxMode,
          ...(row.issueDate ? { issueDate: row.issueDate } : {}),
          ...(row.dueDate ? { dueDate: row.dueDate } : {}),
          ...(row.validUntil ? { validUntil: row.validUntil } : {}),
          ...(row.reference ? { reference: row.reference } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
          ...(row.terms ? { terms: row.terms } : {}),
          ...(row.status === 'draft' ? {} : { brandSnapshot }),
          source: row.source ?? 'manual',
          payments: row.payments.map((payment) => ({
            id: payment.id ?? newLineItemId(),
            amount: payment.amount,
            method: payment.method,
            paidAt: payment.paidAt,
            ...(payment.reference ? { reference: payment.reference } : {}),
            ...(payment.note ? { note: payment.note } : {}),
            recordedBy: new Types.ObjectId(context.userId),
            recordedAt: new Date().toISOString(),
            settlesBalance: payment.settlesBalance ?? false,
          })),
          adjustments: row.adjustments.map((adjustment) => ({
            id: adjustment.id ?? newLineItemId(),
            type: 'late_fee' as const,
            amount: adjustment.amount,
            ...(adjustment.basisPoints !== undefined
              ? { basisPoints: adjustment.basisPoints }
              : {}),
            appliedAt: adjustment.appliedAt,
            appliedBy: new Types.ObjectId(context.userId),
            ...(adjustment.effectiveDate ? { effectiveDate: adjustment.effectiveDate } : {}),
          })),
          createdBy: new Types.ObjectId(context.userId),
        });

        applyTotals(doc);
        await doc.save();
        documentIdByClientUuid.set(row.clientUuid, String(doc._id));
        restored.documents += 1;
      }

      const expenses = scoped(Expense, context);
      const knownExpenses = new Set(
        (await findAll(expenses)).map(
          (expense) =>
            `${expense.date}|${expense.amount}|${expense.currency}|${expense.description}`,
        ),
      );
      for (const row of input.expenses) {
        const key = `${row.date}|${row.amount}|${row.currency}|${row.description}`;
        if (knownExpenses.has(key)) {
          skipped.expenses += 1;
          continue;
        }
        await expenses.create({
          date: row.date,
          category: row.category,
          description: row.description,
          ...(row.vendor ? { vendor: row.vendor } : {}),
          amount: row.amount,
          currency: row.currency,
          ...(row.taxMinor !== undefined ? { taxMinor: row.taxMinor } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
          billable: row.billable,
          createdBy: new Types.ObjectId(context.userId),
        });
        knownExpenses.add(key);
        restored.expenses += 1;
      }

      const timeEntries = scoped(TimeEntry, context);
      const knownTime = new Set(
        (await findAll(timeEntries)).map(
          (entry) => `${entry.projectId}|${entry.date}|${entry.minutes}|${entry.description}`,
        ),
      );
      for (const row of input.timeEntries) {
        const project = projectByName.get(row.projectName);
        if (!project) {
          skipped.timeEntries += 1;
          continue;
        }
        const key = `${project._id}|${row.date}|${row.minutes}|${row.description}`;
        if (knownTime.has(key)) {
          skipped.timeEntries += 1;
          continue;
        }
        await timeEntries.create({
          projectId: project._id,
          date: row.date,
          minutes: row.minutes,
          description: row.description,
          hourlyRateMinor: row.hourlyRateMinor,
          currency: row.currency,
          billable: row.billable,
          createdBy: new Types.ObjectId(context.userId),
        });
        knownTime.add(key);
        restored.timeEntries += 1;
      }

      const savedItems = scoped(SavedItem, context);
      const knownItems = new Set(
        (await findAll(savedItems)).map(
          (item) => `${item.description}|${item.unitPrice}|${item.currency}`,
        ),
      );
      for (const row of input.savedItems) {
        const key = `${row.description}|${row.unitPrice}|${row.currency}`;
        if (knownItems.has(key)) {
          skipped.savedItems += 1;
          continue;
        }
        await savedItems.create({
          description: row.description,
          unitPrice: row.unitPrice,
          currency: row.currency,
        });
        knownItems.add(key);
        restored.savedItems += 1;
      }

      // Recurring schedules last, because each one needs its source document.
      const schedules = scoped(RecurringInvoice, context);
      const uuidByDocumentId = new Map<string, string>();
      for (const [uuid, id] of documentIdByClientUuid) uuidByDocumentId.set(id, uuid);
      const scheduleKey = (row: {
        sourceClientUuid?: string | undefined;
        startDate: string;
        interval: string;
        intervalCount: number;
      }): string =>
        `${row.sourceClientUuid ?? ''}|${row.startDate}|${row.interval}|${row.intervalCount}`;
      const knownSchedules = new Set(
        (await findAll(schedules)).map((schedule) =>
          scheduleKey({
            sourceClientUuid: uuidByDocumentId.get(String(schedule.sourceDocumentId)),
            startDate: schedule.startDate,
            interval: schedule.interval,
            intervalCount: schedule.intervalCount ?? 1,
          }),
        ),
      );

      for (const row of input.recurring) {
        const key = scheduleKey(row);
        if (knownSchedules.has(key)) {
          skipped.recurring += 1;
          continue;
        }

        const sourceId = row.sourceClientUuid
          ? documentIdByClientUuid.get(row.sourceClientUuid)
          : undefined;
        if (!sourceId) {
          // A schedule whose original invoice is not in this file cannot point
          // at anything; it is reported rather than guessed at.
          skipped.recurring += 1;
          continue;
        }

        const client = row.clientSnapshot?.name
          ? clientByName.get(normalizeNameKey(row.clientSnapshot.name))
          : undefined;

        await schedules.create({
          sourceDocumentId: sourceId,
          ...(client ? { clientId: client._id } : {}),
          ...(row.clientSnapshot ? { clientSnapshot: row.clientSnapshot } : {}),
          items: row.items.map((item) => ({
            id: item.id ?? newLineItemId(),
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
            ...(item.unit ? { unit: item.unit } : {}),
          })),
          currency: row.currency,
          ...(row.discount
            ? {
                discount:
                  row.discount.type === 'percent'
                    ? { type: 'percent', valueBp: row.discount.valueBp }
                    : { type: 'fixed', valueMinor: row.discount.valueMinor },
              }
            : {}),
          taxRateBp: row.taxRateBp,
          taxMode: row.taxMode,
          ...(row.notes ? { notes: row.notes } : {}),
          ...(row.terms ? { terms: row.terms } : {}),
          interval: row.interval,
          intervalCount: row.intervalCount,
          startDate: row.startDate,
          ...(row.endDate ? { endDate: row.endDate } : {}),
          // A restored schedule resumes at today, never backfilling months: the
          // invoices for those months are already in the file as documents.
          nextRunAt: row.active && row.nextRunAt < today ? today : row.nextRunAt,
          dueDays: row.dueDays,
          active: row.active,
          createdBy: new Types.ObjectId(context.userId),
        });

        knownSchedules.add(key);
        restored.recurring += 1;
      }

      // Settings next, then brand images, so the restored logos are the ones set.
      if (input.business) {
        const update: BusinessUpdate = { ...input.business };
        if (update.branding) {
          const { logoAssetId: _logo, signatureAssetId: _signature, ...branding } = update.branding;
          update.branding = branding;
        }
        applyBusinessUpdate(business, update);
      }

      for (const kind of ['logo', 'signature'] as const) {
        const dataUrl = input.brandAssets?.[kind];
        if (!dataUrl) continue;
        const image = parseImageDataUrl(
          dataUrl,
          kind === 'logo' ? LOGO_MAX_BYTES : SIGNATURE_MAX_BYTES,
        );
        const existing = await BrandAsset.findOne({
          business: context.businessId,
          sha256: image.sha256,
        });
        const asset =
          existing ??
          (await BrandAsset.create({
            business: new Types.ObjectId(context.businessId),
            sha256: image.sha256,
            mime: image.mime,
            dataUrl: image.dataUrl,
            size: image.size,
          }));
        business.brand = {
          ...(business.brand ?? {}),
          ...(kind === 'logo' ? { logoAssetId: asset._id } : { signatureAssetId: asset._id }),
        } as typeof business.brand;
      }

      await business.save();

      if (lastPart) {
        await logActivity(context, {
          type: 'business.updated',
          summary: part
            ? `Restored a backup in ${part.total} parts`
            : `Restored a backup: ${restored.documents} documents, ${restored.clients} clients`,
          entityId: context.businessId,
        });
      }

      return {
        restored,
        skipped,
        today,
        business: serializeBusiness(business),
      };
    },
  );
};
