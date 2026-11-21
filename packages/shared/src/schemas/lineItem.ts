import { z } from 'zod';
import { minorUnitsSchema, optionalText, quantitySchema } from './common.js';

/** A line on a document. Money is minor units, quantity has up to 3 decimals. */
export const lineItemSchema = z.object({
  /** Stable id so the editor can reorder lines without losing focus. */
  id: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().min(1, 'Add a description').max(500),
  quantity: quantitySchema.default(1),
  unitPrice: minorUnitsSchema,
  /** Per-line discount in basis points (1500 = 15%). */
  discountBp: z.number().int().min(0).max(10000).optional(),
  /** Free-form unit, e.g. "hours", "days", "pcs". Not printed unless set. */
  unit: optionalText(20),
  /** Set when the line came from tracked time or a billable expense. */
  timeEntryIds: z.array(z.string().trim().max(64)).max(500).optional(),
  expenseIds: z.array(z.string().trim().max(64)).max(500).optional(),
});

export type LineItem = z.infer<typeof lineItemSchema>;

export const discountSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), valueBp: z.number().int().min(0).max(10000) }),
  z.object({ type: z.literal('fixed'), valueMinor: minorUnitsSchema }),
]);

export type Discount = z.infer<typeof discountSchema>;
