import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  minorUnitsSchema,
  optionalText,
  positiveMinorUnitsSchema,
} from './common.js';
import { currencySchema, paymentMethodSchema } from './enums.js';
import { documentInputSchema } from './document.js';

/**
 * Schemas for list filters and small lifecycle bodies. The mobile app sends
 * these and the API parses them, so a filter means the same thing on both sides.
 */

export const clientListQuerySchema = z.object({
  q: optionalText(200),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const documentListQuerySchema = z.object({
  docType: z.enum(['invoice', 'estimate', 'credit_note']).optional(),
  /** `sent` is the stored state; partial, overdue and expired are derived. */
  status: z.enum(['draft', 'sent', 'paid', 'void', 'partial', 'overdue', 'expired']).optional(),
  clientId: z.string().trim().max(64).optional(),
  q: optionalText(200),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sort: z.enum(['newest', 'oldest', 'dueDate', 'amount']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: optionalText(500),
});

/** A draft can change any editable field; docType and clientUuid are fixed. */
export const documentUpdateSchema = documentInputSchema
  .omit({ clientUuid: true, docType: true })
  .partial();

export const issueDocumentSchema = z.object({
  issueDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
});

export const paymentInputSchema = z.object({
  amount: positiveMinorUnitsSchema,
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema.optional(),
  reference: optionalText(100),
  note: optionalText(500),
});

export const statusChangeSchema = z.object({
  status: z.enum(['sent', 'paid', 'void']),
});

export const creditApplicationSchema = z.object({
  creditNoteId: z.string().trim().min(1).max(64),
  /** Omit to apply as much as the invoice balance and credit allow. */
  amount: positiveMinorUnitsSchema.optional(),
});

export const duplicateDocumentSchema = z.object({
  /** Optional device ID for the copy; one is generated when omitted. */
  clientUuid: z.string().trim().min(8).max(64).optional(),
});

export const savedItemInputSchema = z.object({
  description: z.string().trim().min(1, 'Add a description').max(500),
  unitPrice: minorUnitsSchema,
  currency: currencySchema,
});
