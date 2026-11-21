import { z } from 'zod';
import { hexColorSchema, httpsUrlSchema, languageSchema, optionalText } from './common.js';
import {
  currencySchema,
  fontPairSchema,
  headerLayoutSchema,
  pageSizeSchema,
  taxModeSchema,
} from './enums.js';
import { discountSchema } from './lineItem.js';

/** Named tax rates such as "VAT 20%". Rates come from official tax pages. */
export const taxPresetSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(60),
  rateBp: z.number().int().min(0).max(10000),
  /** Date the rate was checked against the tax authority's page. */
  checkedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Shown next to the rate: "check your local rate". */
  note: optionalText(200),
});

export type TaxPreset = z.infer<typeof taxPresetSchema>;

export const brandingSchema = z.object({
  color: hexColorSchema.default('#1F5F4A'),
  template: z.enum(['classic', 'modern', 'minimal']).default('classic'),
  fontPair: fontPairSchema.default('manrope-inter'),
  headerLayout: headerLayoutSchema.default('logo-left'),
  logoAssetId: z.string().trim().max(64).optional(),
  signatureAssetId: z.string().trim().max(64).optional(),
});

export type Branding = z.infer<typeof brandingSchema>;

export const numberingSchema = z.object({
  invoice: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,6}$/)
    .default('INV'),
  estimate: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,6}$/)
    .default('EST'),
  credit_note: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,6}$/)
    .default('CN'),
});

export type Numbering = z.infer<typeof numberingSchema>;

export const paymentDetailsSchema = z.object({
  instructions: optionalText(1000),
  link: httpsUrlSchema.optional(),
});

export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;

export const lateFeeRuleSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().int().min(0).max(10000).default(0),
  graceDays: z.number().int().min(0).max(365).default(0),
});

export type LateFeeRule = z.infer<typeof lateFeeRuleSchema>;

export const reminderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Local hour, 0 to 23, at which reminders fire. */
  hour: z.number().int().min(0).max(23).default(9),
  /** Days before the due date; 0, or 0 to 7. 0 turns the pre-due reminder off. */
  daysBefore: z.number().int().min(0).max(7).default(2),
});

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const timeRoundingSchema = z.enum(['none', '5', '15']);

/**
 * Business profile and defaults. Every record in the product carries the
 * business ID, so these settings are read once per request.
 */
export const businessInputSchema = z.object({
  name: z.string().trim().min(1, 'Add a business name').max(200),
  contactName: optionalText(120),
  email: optionalText(200),
  phone: optionalText(40),
  address: optionalText(500),
  taxId: optionalText(60),
  website: optionalText(200),
  currency: currencySchema.default('USD'),
  language: languageSchema,
  pageSize: pageSizeSchema.default('A4'),
  taxRateBp: z.number().int().min(0).max(10000).default(0),
  taxMode: taxModeSchema.default('added'),
  dueDays: z.number().int().min(0).max(365).default(14),
  defaultDocumentDiscount: discountSchema.nullable().optional(),
  branding: brandingSchema.optional(),
  numbering: numberingSchema.optional(),
  payment: paymentDetailsSchema.optional(),
  taxPresets: z.array(taxPresetSchema).max(50).optional(),
  lateFee: lateFeeRuleSchema.optional(),
  reminders: reminderSettingsSchema.optional(),
  timeRounding: timeRoundingSchema.optional(),
});

export type BusinessInput = z.infer<typeof businessInputSchema>;
