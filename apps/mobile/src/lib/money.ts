import { majorToMinor, minorToMajorString } from '@invoxa/shared';

/**
 * The editor and payment sheet take text from people, but money is only ever
 * stored as integer minor units. Parsing lives here so both screens agree.
 */

export function parseAmountToMinor(value: string, currency: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  if (!/^\d{0,9}(\.\d{0,4})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  try {
    return majorToMinor(amount, currency);
  } catch {
    return null;
  }
}

/** Minor units as the plain value a field should show, e.g. 132000 -> "1320.00". */
export function amountToInput(minor: number, currency: string): string {
  return minorToMajorString(minor, currency);
}

/** "15" or "15.5" to 1500 or 1550 basis points; null when out of range. */
export function parsePercentToBasisPoints(value: string): number | null {
  const cleaned = value.replace(',', '.').trim();
  if (!cleaned) return 0;
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(cleaned)) return null;
  const percent = Number(cleaned);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round(percent * 100);
}

export function parseQuantity(value: string): number | null {
  const cleaned = value.replace(',', '.').trim();
  if (!cleaned) return null;
  if (!/^\d{0,7}(\.\d{0,3})?$/.test(cleaned)) return null;
  const quantity = Number(cleaned);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return quantity;
}
