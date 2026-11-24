import { Types, type HydratedDocument } from 'mongoose';
import { addDays, nextRunDate } from '@invoxa/shared';
import { Document, type DocumentRecord } from '../models/document.js';
import {
  RecurringInvoice,
  RecurringRun,
  type RecurringInvoiceRecord,
} from '../models/recurringInvoice.js';
import { applyTotals, newLineItemId } from './documents.js';

export type RecurringDocument = HydratedDocument<RecurringInvoiceRecord>;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

function serializeDiscount(discount: RecurringInvoiceRecord['discount']) {
  if (!discount || !discount.type) return null;
  return discount.type === 'percent'
    ? { type: 'percent' as const, valueBp: discount.valueBp ?? 0 }
    : { type: 'fixed' as const, valueMinor: discount.valueMinor ?? 0 };
}

export function serializeSchedule(schedule: RecurringDocument) {
  return {
    id: String(schedule._id),
    documentId: String(schedule.sourceDocumentId),
    clientId: schedule.clientId ? String(schedule.clientId) : null,
    clientName: schedule.clientSnapshot?.name ?? null,
    currency: schedule.currency,
    items: (schedule.items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
      ...(item.unit ? { unit: item.unit } : {}),
    })),
    discount: serializeDiscount(schedule.discount),
    taxRateBp: schedule.taxRateBp ?? 0,
    taxMode: schedule.taxMode ?? 'added',
    interval: schedule.interval,
    intervalCount: schedule.intervalCount ?? 1,
    startDate: schedule.startDate,
    endDate: schedule.endDate ?? null,
    nextRunAt: schedule.nextRunAt,
    dueDays: schedule.dueDays ?? 14,
    active: schedule.active ?? true,
    lastRunAt: schedule.lastRunAt ?? null,
    lastDocumentId: schedule.lastDocumentId ? String(schedule.lastDocumentId) : null,
    lastError: schedule.lastError ?? null,
    createdAt: (schedule.createdAt as Date | undefined)?.toISOString() ?? new Date().toISOString(),
  };
}

/** One draft for one occurrence, with that occurrence's date as the issue date. */
async function createDraft(
  schedule: RecurringDocument,
  scheduledFor: string,
): Promise<HydratedDocument<DocumentRecord>> {
  const doc = new Document({
    business: schedule.business,
    clientUuid: `rec-${String(schedule._id)}-${scheduledFor}`,
    docType: 'invoice',
    status: 'draft',
    number: null,
    ...(schedule.clientId ? { clientId: schedule.clientId } : {}),
    ...(schedule.clientSnapshot ? { clientSnapshot: schedule.clientSnapshot } : {}),
    items: (schedule.items ?? []).map((item) => ({
      id: item.id || newLineItemId(),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discountBp !== undefined ? { discountBp: item.discountBp } : {}),
      ...(item.unit ? { unit: item.unit } : {}),
    })),
    currency: schedule.currency,
    ...(schedule.discount?.type
      ? {
          discount:
            schedule.discount.type === 'percent'
              ? { type: 'percent', valueBp: schedule.discount.valueBp ?? 0 }
              : { type: 'fixed', valueMinor: schedule.discount.valueMinor ?? 0 },
        }
      : {}),
    taxRateBp: schedule.taxRateBp ?? 0,
    taxMode: schedule.taxMode ?? 'added',
    issueDate: scheduledFor,
    dueDate: addDays(scheduledFor, schedule.dueDays ?? 14),
    ...(schedule.notes ? { notes: schedule.notes } : {}),
    ...(schedule.terms ? { terms: schedule.terms } : {}),
    source: 'recurring',
    ...(schedule.createdBy ? { createdBy: schedule.createdBy } : {}),
  }) as unknown as HydratedDocument<DocumentRecord>;

  applyTotals(doc);
  await doc.save();
  return doc;
}

/**
 * Runs every schedule that is due, at most 12 occurrences per schedule so a long
 * outage cannot flood a business. A failed draft is logged on the schedule and
 * retried next time; its idempotency row is removed first.
 */
export async function runRecurring(options: {
  businessId?: string;
  today: string;
}): Promise<{ created: number; schedules: number; documents: string[] }> {
  const filter: Record<string, unknown> = { active: true, nextRunAt: { $lte: options.today } };
  if (options.businessId) filter['business'] = new Types.ObjectId(options.businessId);

  const schedules = (await RecurringInvoice.find(filter)
    .sort({ nextRunAt: 1 })
    .limit(50)
    .exec()) as RecurringDocument[];

  let created = 0;
  const documents: string[] = [];

  for (const schedule of schedules) {
    let guard = 0;

    while (schedule.active && schedule.nextRunAt <= options.today && guard < 12) {
      guard += 1;
      const scheduledFor = schedule.nextRunAt;

      try {
        await RecurringRun.create({
          business: schedule.business,
          schedule: schedule._id,
          scheduledFor,
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        advance(schedule, scheduledFor);
        continue;
      }

      try {
        const doc = await createDraft(schedule, scheduledFor);
        await RecurringRun.updateOne(
          { schedule: schedule._id, scheduledFor },
          { $set: { documentId: doc._id } },
        );
        schedule.lastRunAt = scheduledFor;
        schedule.lastDocumentId = doc._id;
        schedule.lastError = undefined;
        documents.push(String(doc._id));
        created += 1;
      } catch (error) {
        await RecurringRun.deleteOne({ schedule: schedule._id, scheduledFor });
        schedule.lastError =
          error instanceof Error ? error.message.slice(0, 300) : 'Could not create the draft';
        break;
      }

      advance(schedule, scheduledFor);
    }

    await schedule.save();
  }

  return { created, schedules: schedules.length, documents };
}

function advance(schedule: RecurringDocument, scheduledFor: string): void {
  const next = nextRunDate(
    scheduledFor,
    schedule.startDate,
    schedule.interval,
    schedule.intervalCount ?? 1,
  );
  schedule.nextRunAt = next;

  if (schedule.endDate && next > schedule.endDate) {
    schedule.active = false;
  }
}
