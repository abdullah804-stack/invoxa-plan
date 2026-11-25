import { z } from 'zod';
import { isoDateSchema } from './common.js';
import { currencySchema, documentTypeSchema } from './enums.js';
import { documentInputSchema } from './document.js';

/** Report ranges are calendar dates. A missing end means "everything so far". */
export const reportRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  currency: currencySchema.optional(),
});

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const documentCsvQuerySchema = z.object({
  docType: documentTypeSchema.optional(),
  status: z.enum(['draft', 'sent', 'paid', 'void']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  clientId: z.string().trim().max(64).optional(),
  q: z.string().trim().max(100).optional(),
});

export type DocumentCsvQuery = z.infer<typeof documentCsvQuerySchema>;

export const expenseCsvQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category: z
    .enum(['software', 'travel', 'meals', 'supplies', 'equipment', 'fees', 'other'])
    .optional(),
});

export type ExpenseCsvQuery = z.infer<typeof expenseCsvQuerySchema>;

/**
 * Offline sync. The phone sends the drafts it created or edited while it had no
 * signal. Each item carries the device clientUuid, which makes a retried sync a
 * no-op, and the updatedAt it last saw, so a server change is never overwritten
 * silently: the result says `conflict` and the app offers keep-both.
 */
export const syncInvoiceItemSchema = z.object({
  /** The server updatedAt the device started from; omitted for a new draft. */
  baseUpdatedAt: z.string().trim().max(40).nullish(),
  document: documentInputSchema,
});

export const syncInvoicesRequestSchema = z.object({
  invoices: z.array(syncInvoiceItemSchema).min(1).max(20),
});

export type SyncInvoicesRequest = z.infer<typeof syncInvoicesRequestSchema>;

/** Refine: the assistant rewrites one field's text, never the money. */
export const AI_REFINE_TONES = ['shorter', 'friendlier', 'formal', 'clearer'] as const;

export const aiRefineRequestSchema = z.object({
  text: z.string().trim().min(1, 'Add some text to refine').max(2000),
  tone: z.enum(AI_REFINE_TONES).default('clearer'),
  language: z.string().trim().max(10).optional(),
});

export type AiRefineRequest = z.infer<typeof aiRefineRequestSchema>;

export const aiRefineResultSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type AiRefineResult = z.infer<typeof aiRefineResultSchema>;
