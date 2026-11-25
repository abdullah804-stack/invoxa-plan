import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { syncInvoicesRequestSchema, type DocumentInput } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { Client } from '../models/client.js';
import { Document } from '../models/document.js';
import { scoped } from '../scoped.js';
import {
  applyTotals,
  buildClientSnapshot,
  newLineItemId,
  requestToday,
  serializeDocument,
  type DocumentDocument,
} from '../services/documents.js';
import { logActivity } from '../services/activity.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface SyncRouteOptions {
  config: ApiConfig;
}

type SyncResult =
  | {
      status: 'created' | 'updated';
      clientUuid: string;
      document: ReturnType<typeof serializeDocument>;
    }
  | {
      status: 'conflict' | 'failed';
      clientUuid: string;
      message: string;
      document?: ReturnType<typeof serializeDocument>;
    };

/** The device sent the server copy it started from; a newer server wins. */
function hasConflict(existing: DocumentDocument, base: string | null | undefined): boolean {
  if (!base) return false;
  const serverUpdatedAt = existing.updatedAt?.toISOString();
  return Boolean(serverUpdatedAt && serverUpdatedAt !== base);
}

function draftFields(input: DocumentInput) {
  return {
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
    ...(input.projectId && Types.ObjectId.isValid(input.projectId)
      ? { projectId: new Types.ObjectId(input.projectId) }
      : {}),
  };
}

/**
 * Offline draft sync (plan week 10).
 *
 * The phone keeps drafts it wrote without a signal and sends them here when it is
 * back. `clientUuid` makes a retry a no-op and `baseUpdatedAt` turns a server
 * change into a conflict instead of a silent overwrite. One bad item never
 * rejects the others: every item gets its own result.
 */
export const syncRoutes: FastifyPluginAsync<SyncRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.post('/sync/invoices', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'drafts:create');

    const body = parseOrThrow(syncInvoicesRequestSchema, request.body ?? {});
    const documents = scoped(Document, context);
    const today = requestToday(request);
    const results: SyncResult[] = [];

    for (const item of body.invoices) {
      const input = item.document;
      try {
        const existing = await documents.findOne({ clientUuid: input.clientUuid });

        if (existing) {
          if (existing.docType !== input.docType) {
            results.push({
              status: 'failed',
              clientUuid: input.clientUuid,
              message: 'A draft with that device ID already exists as another type',
            });
            continue;
          }
          if (existing.status !== 'draft') {
            results.push({
              status: 'conflict',
              clientUuid: input.clientUuid,
              message: 'This draft was already issued. Keep both and edit the new one.',
              document: serializeDocument(existing, today),
            });
            continue;
          }
          if (hasConflict(existing, item.baseUpdatedAt)) {
            results.push({
              status: 'conflict',
              clientUuid: input.clientUuid,
              message: 'This draft changed on another device. Keep both and edit the new one.',
              document: serializeDocument(existing, today),
            });
            continue;
          }

          const fields = draftFields(input);
          existing.items = fields.items as typeof existing.items;
          existing.currency = input.currency;
          existing.discount = fields.discount as typeof existing.discount;
          existing.taxRateBp = fields.taxRateBp;
          existing.taxMode = fields.taxMode;
          existing.issueDate = fields.issueDate;
          existing.dueDate = fields.dueDate;
          existing.validUntil = fields.validUntil;
          existing.reference = fields.reference;
          existing.notes = fields.notes;
          existing.terms = fields.terms;
          existing.projectId = fields.projectId as typeof existing.projectId;

          const client = input.clientId
            ? Types.ObjectId.isValid(input.clientId)
              ? await scoped(Client, context).findById(input.clientId)
              : null
            : null;
          if (input.clientId && !client) {
            results.push({
              status: 'failed',
              clientUuid: input.clientUuid,
              message: 'That client could not be found',
            });
            continue;
          }
          if (client) {
            existing.clientId = client._id;
            existing.clientSnapshot = buildClientSnapshot(client) as typeof existing.clientSnapshot;
          } else if (input.clientSnapshot) {
            existing.clientSnapshot = input.clientSnapshot as typeof existing.clientSnapshot;
          }

          applyTotals(existing);
          await existing.save();
          results.push({
            status: 'updated',
            clientUuid: input.clientUuid,
            document: serializeDocument(existing, today),
          });
          continue;
        }

        const client = input.clientId
          ? Types.ObjectId.isValid(input.clientId)
            ? await scoped(Client, context).findById(input.clientId)
            : null
          : null;
        if (input.clientId && !client) {
          results.push({
            status: 'failed',
            clientUuid: input.clientUuid,
            message: 'That client could not be found',
          });
          continue;
        }

        const fields = draftFields(input);
        const created = await documents.create({
          clientUuid: input.clientUuid,
          docType: input.docType,
          status: 'draft',
          number: null,
          currency: input.currency,
          ...(client ? { clientId: client._id } : {}),
          ...(client
            ? { clientSnapshot: buildClientSnapshot(client) }
            : input.clientSnapshot
              ? { clientSnapshot: input.clientSnapshot }
              : {}),
          ...fields,
          source: input.source,
          createdBy: new Types.ObjectId(context.userId),
        });

        applyTotals(created);
        await created.save();
        results.push({
          status: 'created',
          clientUuid: input.clientUuid,
          document: serializeDocument(created, today),
        });
      } catch (error) {
        results.push({
          status: 'failed',
          clientUuid: input.clientUuid,
          message: error instanceof Error ? error.message : 'This draft could not be synced',
        });
      }
    }

    const created = results.filter((result) => result.status === 'created').length;
    if (created > 0) {
      await logActivity(context, {
        type: 'document.created',
        summary: `Synced ${created} offline ${created === 1 ? 'draft' : 'drafts'}`,
      });
    }

    return { results };
  });
};
