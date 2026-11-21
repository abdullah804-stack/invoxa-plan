import type { MinorUnits } from './money.js';

/**
 * Currency data and formatting. Totals are never added across currencies, so
 * every formatter takes exactly one currency.
 */

export const ZERO_DECIMAL_CURRENCIES = [
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
] as const;

export const THREE_DECIMAL_CURRENCIES = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as const;

export const CURRENCIES = [
  'AED',
  'AUD',
  'BDT',
  'BHD',
  'BIF',
  'BRL',
  'CAD',
  'CHF',
  'CLP',
  'CNY',
  'CZK',
  'DKK',
  'DJF',
  'EGP',
  'EUR',
  'GBP',
  'GHS',
  'GNF',
  'HKD',
  'IDR',
  'INR',
  'IQD',
  'ISK',
  'JOD',
  'JPY',
  'KES',
  'KMF',
  'KRW',
  'KWD',
  'LKR',
  'LYD',
  'MXN',
  'MYR',
  'NGN',
  'NOK',
  'NZD',
  'OMR',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RWF',
  'SAR',
  'SEK',
  'SGD',
  'THB',
  'TND',
  'TRY',
  'UGX',
  'USD',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
  'ZAR',
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

const CURRENCY_SET: ReadonlySet<string> = new Set(CURRENCIES);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCY_SET.has(code);
}

export function currencyExponent(code: string): number {
  if ((ZERO_DECIMAL_CURRENCIES as readonly string[]).includes(code)) return 0;
  if ((THREE_DECIMAL_CURRENCIES as readonly string[]).includes(code)) return 3;
  return 2;
}

/** 132000 -> 1320.00 as a plain string, no grouping. */
export function minorToMajorString(amount: MinorUnits, currency: string): string {
  const exponent = currencyExponent(currency);
  const negative = amount < 0;
  const digits = String(Math.abs(amount)).padStart(exponent + 1, '0');
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Major units (a number) to minor units. Used when code accepts AI output. */
export function majorToMinor(amount: number, currency: string): MinorUnits {
  if (!Number.isFinite(amount)) throw new Error('amount must be a finite number');
  const exponent = currencyExponent(currency);
  const factor = 10 ** exponent;
  const minor = Math.round(amount * factor);
  if (!Number.isSafeInteger(minor)) throw new Error('amount is out of range');
  return minor;
}

export function formatMoney(amount: MinorUnits, currency: string, language = 'en'): string {
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  const exponent = currencyExponent(currency);
  const value = amount / 10 ** exponent;
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(value);
  }
}

/** Format a YYYY-MM-DD calendar date for a language, with no time zone shift. */
export function formatDate(isoDate: string, language = 'en'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  try {
    return new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return isoDate;
  }
}
