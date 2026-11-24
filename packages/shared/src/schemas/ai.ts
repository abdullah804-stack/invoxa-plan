import { z } from 'zod';
import {
  currencySchema,
  documentTypeSchema,
  expenseCategorySchema,
  taxModeSchema,
} from './enums.js';
import { discountSchema } from './lineItem.js';
import { isoDateSchema, minorUnitsSchema, optionalText } from './common.js';

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

/**
 * Receipt scanning: the phone shrinks the photo and sends it once, the server
 * extracts the fields and never stores the image. The result is a suggestion the
 * user reviews and confirms before anything is saved.
 */
export const receiptScanRequestSchema = z.object({
  /** A PNG or JPEG data URL, resized on the phone to keep the request small. */
  image: z
    .string()
    .min(100)
    .max(4_000_000)
    .refine(
      (value) => /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(value),
      'Send a PNG or JPEG image',
    ),
});

export type ReceiptScanRequest = z.infer<typeof receiptScanRequestSchema>;

export const receiptScanResultSchema = z.object({
  vendor: optionalText(200),
  date: isoDateSchema.optional(),
  description: z.string().trim().min(1).max(500),
  category: expenseCategorySchema,
  /** Integer minor units in the business currency. */
  amount: minorUnitsSchema.refine((value) => value > 0, 'The receipt has no usable total'),
  taxMinor: minorUnitsSchema.optional(),
  currency: currencySchema,
});

export type ReceiptScanResult = z.infer<typeof receiptScanResultSchema>;
