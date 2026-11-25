import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, minorUnitsSchema, optionalText } from './common.js';
import { businessInputSchema } from './business.js';
import {
  currencySchema,
  documentTypeSchema,
  expenseCategorySchema,
  paymentMethodSchema,
  storedDocumentStatusSchema,
} from './enums.js';

/**
 * The JSON backup: one file that holds a business's profile and its records in
 * the same shapes the screens use. Restoring validates every row with these
 * schemas before writing anything, so a truncated or edited file is refused
 * rather than half-imported.
 */

export const BACKUP_VERSION = 1;

const lineItemSchema = z.object({
  id: optionalText(64),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().min(0).max(1_000_000),
  unitPrice: minorUnitsSchema,
  discountBp: z.number().int().min(0).max(10000).optional(),
  unit: optionalText(20),
});

const paymentSchema = z.object({
  id: optionalText(64),
  amount: minorUnitsSchema.min(1),
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema,
  reference: optionalText(100),
  note: optionalText(500),
  settlesBalance: z.boolean().optional(),
});

const adjustmentSchema = z.object({
  id: optionalText(64),
  type: z.literal('late_fee'),
  amount: minorUnitsSchema.min(1),
  basisPoints: z.number().int().min(0).max(10000).optional(),
  appliedAt: isoDateSchema,
  effectiveDate: isoDateSchema.optional(),
});

const clientSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalText(200),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
});

export const backupClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalText(200),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
  notes: optionalText(2000),
  archived: z.boolean().default(false),
});

export const backupProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  clientName: optionalText(200),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  currency: currencySchema,
  hourlyRateMinor: minorUnitsSchema.optional(),
  budgetMinor: minorUnitsSchema.optional(),
  startDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  notes: optionalText(2000),
});

export const backupDocumentSchema = z.object({
  /** The merge key: a document with this ID is never imported twice. */
  clientUuid: z.string().trim().min(8).max(64),
  docType: documentTypeSchema,
  status: storedDocumentStatusSchema.default('draft'),
  clientName: optionalText(200),
  clientSnapshot: clientSnapshotSchema.optional(),
  items: z.array(lineItemSchema).max(500).default([]),
  currency: currencySchema,
  discount: z
    .union([
      z.object({ type: z.literal('percent'), valueBp: z.number().int().min(0).max(10000) }),
      z.object({ type: z.literal('fixed'), valueMinor: minorUnitsSchema }),
    ])
    .nullable()
    .optional(),
  taxRateBp: z.number().int().min(0).max(10000).default(0),
  taxMode: z.enum(['added', 'included']).default('added'),
  issueDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  validUntil: isoDateSchema.optional(),
  reference: optionalText(100),
  notes: optionalText(2000),
  terms: optionalText(2000),
  source: optionalText(30),
  payments: z.array(paymentSchema).max(200).default([]),
  adjustments: z.array(adjustmentSchema).max(20).default([]),
});

export const backupExpenseSchema = z.object({
  date: isoDateSchema,
  category: expenseCategorySchema,
  description: z.string().trim().min(1).max(500),
  vendor: optionalText(200),
  amount: minorUnitsSchema.min(1),
  currency: currencySchema,
  taxMinor: minorUnitsSchema.optional(),
  notes: optionalText(1000),
  billable: z.boolean().default(false),
});

export const backupTimeEntrySchema = z.object({
  projectName: z.string().trim().min(1).max(200),
  date: isoDateSchema,
  minutes: z.number().int().min(1).max(1440),
  description: z.string().trim().min(1).max(500),
  hourlyRateMinor: minorUnitsSchema,
  currency: currencySchema,
  billable: z.boolean().default(true),
});

export const backupSavedItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  unitPrice: minorUnitsSchema,
  currency: currencySchema,
});

export const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDateTimeSchema.optional(),
  /** The PUT /profile shape, so a restore can bring settings back too. */
  business: businessInputSchema.partial().optional(),
  brandAssets: z
    .object({
      logo: optionalText(2_000_000),
      signature: optionalText(2_000_000),
    })
    .optional(),
  clients: z.array(backupClientSchema).max(2000).default([]),
  projects: z.array(backupProjectSchema).max(500).default([]),
  documents: z.array(backupDocumentSchema).max(2000).default([]),
  expenses: z.array(backupExpenseSchema).max(2000).default([]),
  timeEntries: z.array(backupTimeEntrySchema).max(2000).default([]),
  savedItems: z.array(backupSavedItemSchema).max(1000).default([]),
});

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupDocument = z.infer<typeof backupDocumentSchema>;
