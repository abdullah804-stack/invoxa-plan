import { z } from 'zod';
import { isoDateSchema } from './common.js';
import { currencySchema, taxModeSchema } from './enums.js';
import { lineItemSchema } from './lineItem.js';
import { discountSchema } from './lineItem.js';

/**
 * Recurring invoices repeat an existing invoice. The schedule copies that
 * invoice's lines, client and currency, so there is no second editor to keep in
 * sync; each occurrence is created as a draft, never issued automatically.
 */

export const recurringIntervalSchema = z.enum(['weekly', 'monthly', 'yearly']);

export const recurringCreateSchema = z.object({
  /** The invoice whose lines and client are repeated. */
  documentId: z.string().trim().min(1).max(64),
  interval: recurringIntervalSchema.default('monthly'),
  intervalCount: z.number().int().min(1).max(12).default(1),
  /** First occurrence; defaults to today on the server. */
  startDate: isoDateSchema.optional(),
  /** Payment terms for each generated draft; defaults to the business terms. */
  dueDays: z.number().int().min(0).max(90).optional(),
  endDate: isoDateSchema.optional(),
});

export type RecurringCreate = z.infer<typeof recurringCreateSchema>;

export const recurringUpdateSchema = z.object({
  interval: recurringIntervalSchema.optional(),
  intervalCount: z.number().int().min(1).max(12).optional(),
  dueDays: z.number().int().min(0).max(90).optional(),
  endDate: isoDateSchema.nullable().optional(),
  active: z.boolean().optional(),
});

export type RecurringUpdate = z.infer<typeof recurringUpdateSchema>;

/** The wire shape of one schedule. */
export const recurringScheduleSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  currency: currencySchema,
  items: z.array(lineItemSchema).max(200),
  discount: discountSchema.nullable(),
  taxRateBp: z.number().int(),
  taxMode: taxModeSchema,
  interval: recurringIntervalSchema,
  intervalCount: z.number().int(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  nextRunAt: isoDateSchema,
  dueDays: z.number().int(),
  active: z.boolean(),
  lastRunAt: isoDateSchema.nullable(),
  lastDocumentId: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
});

export type RecurringSchedule = z.infer<typeof recurringScheduleSchema>;
