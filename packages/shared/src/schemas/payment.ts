import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  optionalText,
  positiveMinorUnitsSchema,
} from './common.js';
import { paymentMethodSchema } from './enums.js';

/**
 * A payment against a document. Credit notes are recorded as payments with
 * method "credit_note" and the credit note's number as the reference.
 * Refunds happen outside Invoxa.
 */
export const paymentSchema = z.object({
  id: z.string().trim().max(64).optional(),
  amount: positiveMinorUnitsSchema,
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema,
  reference: optionalText(100),
  note: optionalText(500),
  /** Set when method is credit_note. */
  creditNoteId: z.string().trim().max(64).optional(),
  /** A credit note applied to an invoice can never exceed its balance. */
  recordedBy: z.string().trim().max(64).optional(),
  recordedAt: isoDateTimeSchema.optional(),
});

export type Payment = z.infer<typeof paymentSchema>;

/** A late fee is a separate adjustment and is never taxed. */
export const adjustmentSchema = z.object({
  id: z.string().trim().max(64).optional(),
  type: z.literal('late_fee'),
  amount: positiveMinorUnitsSchema,
  basisPoints: z.number().int().min(0).max(10000).optional(),
  appliedAt: isoDateTimeSchema,
  appliedBy: z.string().trim().max(64).optional(),
  /** Late fees are applied against a calendar date the owner confirms. */
  effectiveDate: isoDateSchema.optional(),
});

export type Adjustment = z.infer<typeof adjustmentSchema>;
