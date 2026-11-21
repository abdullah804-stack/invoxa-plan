import { z } from 'zod';
import { isRealCalendarDate, isoDateSchema, optionalText } from './common.js';
import { clientSnapshotSchema } from './client.js';
import { businessInputSchema } from './business.js';
import {
  currencySchema,
  documentSourceSchema,
  documentTypeSchema,
  storedDocumentStatusSchema,
  taxModeSchema,
} from './enums.js';
import { discountSchema, lineItemSchema } from './lineItem.js';
import { adjustmentSchema, paymentSchema } from './payment.js';
import { brandingSchema } from './business.js';

/**
 * Documents are invoices, estimates and credit notes: one collection, one
 * schema, separated by docType and numbered from separate series.
 */

/** The brand copy frozen onto a document on issue: values and asset IDs, not images. */
export const brandSnapshotSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  contactName: optionalText(120),
  email: optionalText(200),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
  website: optionalText(200),
  branding: brandingSchema,
  paymentInstructions: optionalText(1000),
  paymentLink: optionalText(2000),
  pageSize: z.enum(['A4', 'LETTER']),
  language: z.string().trim().max(10),
});

export type BrandSnapshot = z.infer<typeof brandSnapshotSchema>;

/** Totals as computed by the shared function and stored on the document. */
export const storedTotalsSchema = z.object({
  subtotal: z.number().int(),
  discount: z.number().int(),
  base: z.number().int(),
  tax: z.number().int(),
  total: z.number().int(),
  paid: z.number().int(),
  balance: z.number().int(),
});

export type StoredTotals = z.infer<typeof storedTotalsSchema>;

/** Body for creating or updating a draft. */
export const documentInputSchema = z.object({
  /** Device-generated, so creating a draft twice never duplicates it. */
  clientUuid: z.string().trim().min(8).max(64),
  docType: documentTypeSchema,
  clientId: z.string().trim().max(64).optional(),
  clientSnapshot: clientSnapshotSchema.optional(),
  projectId: z.string().trim().max(64).optional(),
  items: z.array(lineItemSchema).max(200),
  currency: currencySchema,
  discount: discountSchema.nullable().optional(),
  taxRateBp: z.number().int().min(0).max(10000).default(0),
  taxMode: taxModeSchema.default('added'),
  issueDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  validUntil: isoDateSchema.optional(),
  reference: optionalText(100),
  notes: optionalText(2000),
  terms: optionalText(2000),
  source: documentSourceSchema.default('manual'),
  convertedFrom: z.string().trim().max(64).optional(),
});

export type DocumentInput = z.infer<typeof documentInputSchema>;

/** Only these fields may change on an issued document. */
export const issuedDocumentUpdateSchema = z.object({
  notes: optionalText(2000),
  terms: optionalText(2000),
  dueDate: isoDateSchema.optional(),
});

export type IssuedDocumentUpdate = z.infer<typeof issuedDocumentUpdateSchema>;

/** A full stored document. */
export const documentSchema = documentInputSchema.extend({
  id: z.string().trim().max(64),
  business: z.string().trim().max(64),
  number: z.string().trim().max(20).nullable(),
  status: storedDocumentStatusSchema,
  brandSnapshot: brandSnapshotSchema.optional(),
  payments: z.array(paymentSchema).max(500),
  adjustments: z.array(adjustmentSchema).max(20),
  totals: storedTotalsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Document = z.infer<typeof documentSchema>;

/** Due date cannot be before the issue date. */
export function dueDateIsValid(issueDate: string, dueDate: string): boolean {
  if (!isRealCalendarDate(dueDate) || !isRealCalendarDate(issueDate)) return false;
  return dueDate >= issueDate;
}

/** Export schemas that only need the settings shape. */
export const businessSettingsSchema = businessInputSchema.partial();
