import { z } from 'zod';
import { isoDateSchema, minorUnitsSchema, optionalText } from './common.js';
import { currencySchema, expenseCategorySchema } from './enums.js';

/**
 * Business expenses are money out, kept separately from invoices so profit can
 * be seen later. They are always business-scoped, in integer minor units, and
 * never folded into an invoice total unless a later milestone bills them.
 */

export const expenseInputSchema = z.object({
  /** The day the money was spent, not when it was typed in. */
  date: isoDateSchema,
  category: expenseCategorySchema,
  description: z.string().trim().min(1, 'Say what it was for').max(500),
  vendor: optionalText(200),
  /** Gross amount in minor units; must be more than zero. */
  amount: minorUnitsSchema.refine((value) => value > 0, 'Amount must be more than zero'),
  currency: currencySchema,
  /** Optional tax part of the amount, for reclaiming it later. */
  taxMinor: minorUnitsSchema.optional(),
  notes: optionalText(2000),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const expenseUpdateSchema = expenseInputSchema.partial();

export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;

export const expenseListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category: expenseCategorySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
