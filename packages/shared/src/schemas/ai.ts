import { z } from 'zod';
import { currencySchema, documentTypeSchema, taxModeSchema } from './enums.js';
import { discountSchema } from './lineItem.js';
import { minorUnitsSchema, optionalText } from './common.js';

/**
 * AI drafting (plan section "AI"). The model only ever produces a *suggestion*;
 * the API validates it with these schemas and the app turns it into an ordinary
 * draft. No invoice is issued, numbered or sent by the assistant.
 */

export const aiDraftRequestSchema = z.object({
  /** What the user typed. Emails and links are removed before it leaves the server. */
  prompt: z.string().trim().min(3, 'Describe what you are invoicing').max(1000),
  docType: documentTypeSchema.default('invoice'),
});

export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;

export const aiDraftItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0).max(100000),
  /** Integer minor units, converted from the model's major-unit amount. */
  unitPrice: minorUnitsSchema,
  unit: optionalText(20),
});

export type AiDraftItem = z.infer<typeof aiDraftItemSchema>;

export const aiDraftSuggestionSchema = z.object({
  clientName: optionalText(200),
  /** Always the business currency; a model's guess is discarded. */
  currency: currencySchema,
  items: z.array(aiDraftItemSchema).min(1).max(50),
  discount: discountSchema.nullable().optional(),
  taxRateBp: z.number().int().min(0).max(10000).optional(),
  taxMode: taxModeSchema.optional(),
  notes: optionalText(2000),
});

export type AiDraftSuggestion = z.infer<typeof aiDraftSuggestionSchema>;
