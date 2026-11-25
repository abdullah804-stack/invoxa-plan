import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
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
import { SavedItem } from '../models/savedItem.js';
import { scoped } from '../scoped.js';
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
const PAGE_LIMIT = 2000;

export const backupRoutes: FastifyPluginAsync<BackupRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /**
   * A full copy of the active business: settings, brand images, clients,
   * projects, documents with their payments, expenses and saved items. The
   * file is the same JSON the restore endpoint accepts.
   */
  app.get('/backup', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'backup:export');

    const business = await Business.findById(context.businessId);
    if (!business) {
      throw errors.notFound();
    }

    const [clients, projects, documents, expenses, timeEntries, savedItems] = await Promise.all([
      scoped(Client, context).find({}, PAGE_LIMIT),
      scoped(Project, context).find({}, PAGE_LIMIT),
      scoped(Document, context).find({}, PAGE_LIMIT),
      scoped(Expense, context).find({}, PAGE_LIMIT),
      scoped(TimeEntry, context).find({}, PAGE_LIMIT),
      scoped(SavedItem, context).find({}, PAGE_LIMIT),
    ]);

    const projectNames = new Map(projects.map((project) => [String(project._id), project.name]));
    const clientNames = new Map(clients.map((client) => [String(client._id), client.name]));
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
        clientName: doc.clientSnapshot?.name ?? null,
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
  });

  /**
   * The same validation the restore runs, without writing: what the file holds
   * and how much of it this business already has.
   */
  app.post(
    '/backup/preview',
    { preHandler: authenticateRequest, bodyLimit: BACKUP_BODY_LIMIT },
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
    { preHandler: authenticateRequest, bodyLimit: BACKUP_BODY_LIMIT },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'backup:restore');

      const input = parseOrThrow(backupSchema, request.body ?? {});

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
      };
      const skipped = { documents: 0, expenses: 0, timeEntries: 0, savedItems: 0 };

      // Clients first: everything else may point at them.
      const clients = scoped(Client, context);
      const clientByName = new Map(
        (await clients.find({}, PAGE_LIMIT)).map((client) => [client.nameKey, client]),
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
        (await projects.find({}, PAGE_LIMIT)).map((project) => [project.name, project]),
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
      const knownUuids = new Set(
        (await documents.find({}, PAGE_LIMIT)).map((doc) => doc.clientUuid),
      );
      const today = requestToday(request);
      const brandSnapshot = buildBrandSnapshot(business);

      for (const row of input.documents) {
        if (knownUuids.has(row.clientUuid)) {
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
        knownUuids.add(row.clientUuid);
        restored.documents += 1;
      }

      const expenses = scoped(Expense, context);
      const knownExpenses = new Set(
        (await expenses.find({}, PAGE_LIMIT)).map(
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
        (await timeEntries.find({}, PAGE_LIMIT)).map(
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
        (await savedItems.find({}, PAGE_LIMIT)).map(
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

      await logActivity(context, {
        type: 'business.updated',
        summary: `Restored a backup: ${restored.documents} documents, ${restored.clients} clients`,
        entityId: context.businessId,
      });

      return {
        restored,
        skipped,
        today,
        business: serializeBusiness(business),
      };
    },
  );
};
