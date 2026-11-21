import { z } from 'zod';

/**
 * Shared Zod primitives. Every body, query and param in the API is validated
 * with these schemas, and the mobile editor uses the same ones.
 */

export const minorUnitsSchema = z
  .number()
  .int('Amounts are whole minor units')
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const positiveMinorUnitsSchema = minorUnitsSchema.min(1, 'Must be greater than zero');

export const basisPointsSchema = z
  .number()
  .int()
  .min(0)
  .max(10000, 'Rates are at most 10000 basis points (100%)');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Due dates and issue dates are calendar dates with no time zone. */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, 'Use YYYY-MM-DD')
  .refine(isRealCalendarDate, 'Not a real calendar date');

export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Use an ISO 8601 date-time');

/** Quantities have up to 3 decimals. */
export const quantitySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Quantity has at most 3 decimals',
  });

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #1F5F4A');

/** Payment links are https only: no javascript:, no data:, no http. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Only https:// links are allowed');

export const optionalText = (max: number) => z.string().trim().max(max).optional();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address');

/** Language codes for invoice labels, e.g. en, es, fr. */
export const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Use a language code such as en or es')
  .default('en');

export const timeZoneSchema = z
  .string()
  .trim()
  .max(60)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');
