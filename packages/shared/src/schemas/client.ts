import { z } from 'zod';
import { emailSchema, optionalText } from './common.js';

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, 'Add a client name').max(200),
  email: emailSchema.optional(),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
  notes: optionalText(2000),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export const clientUpdateSchema = clientInputSchema.partial().extend({
  archived: z.boolean().optional(),
});

export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

/**
 * The copy of the client details that is frozen onto an issued document, so
 * later edits never change an invoice that was already sent.
 */
export const clientSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalText(200),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
});

export type ClientSnapshot = z.infer<typeof clientSnapshotSchema>;

/**
 * Normalised key used for client matching and duplicate detection:
 * lowercase, accents stripped, punctuation and extra spaces removed.
 */
export function normalizeNameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
