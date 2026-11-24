import { z } from 'zod';
import { isoDateSchema, minorUnitsSchema, optionalText } from './common.js';
import { currencySchema } from './enums.js';

/**
 * A project groups work for one client: a budget, an hourly rate and the time
 * tracked against it. Invoices can point at a project, and unbilled billable
 * time can be turned into a draft invoice line in one step.
 */

export const projectStatusSchema = z.enum(['active', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the project').max(200),
  clientId: z.string().trim().max(64).optional(),
  status: projectStatusSchema.default('active'),
  currency: currencySchema,
  /** What an hour of this project is billed at; used as the time entry default. */
  hourlyRateMinor: minorUnitsSchema.optional(),
  /** Optional cap, shown as a progress bar; never enforced. */
  budgetMinor: minorUnitsSchema.optional(),
  startDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  notes: optionalText(2000),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectUpdateSchema = projectInputSchema.partial();
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectListQuerySchema = z.object({
  status: projectStatusSchema.optional(),
  clientId: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const timeEntryInputSchema = z.object({
  projectId: z.string().trim().min(1).max(64),
  date: isoDateSchema,
  /** Whole minutes worked; at most one day per entry. */
  minutes: z.number().int().min(1, 'Add at least a minute').max(1440, 'One day is the maximum'),
  description: z.string().trim().min(1, 'Say what you did').max(500),
  /** Hourly rate in minor units, snapshotted so a later project rate cannot change history. */
  hourlyRateMinor: minorUnitsSchema,
  billable: z.boolean().default(true),
});

export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

export const timeEntryUpdateSchema = timeEntryInputSchema.partial();
export type TimeEntryUpdate = z.infer<typeof timeEntryUpdateSchema>;

export const timeEntryListQuerySchema = z.object({
  projectId: z.string().trim().max(64).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  unbilled: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const billTimeSchema = z.object({
  /** Optional payment terms; defaults to the business terms. */
  dueDays: z.number().int().min(0).max(90).optional(),
});
