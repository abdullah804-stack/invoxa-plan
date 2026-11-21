import type { DocumentType } from './status.js';

/**
 * Numbers are assigned only on issue, from separate series, padded to 4 digits.
 * Numbers are never reused: a failed issue may leave a gap, and voided numbers
 * stay used.
 */

export const SERIES_PREFIXES: Record<DocumentType, string> = {
  invoice: 'INV',
  estimate: 'EST',
  credit_note: 'CN',
};

export const NUMBER_PAD = 4;

export function formatDocumentNumber(prefix: string, sequence: number): string {
  if (!/^[A-Z]{1,6}$/.test(prefix)) {
    throw new Error('prefix must be 1 to 6 uppercase letters');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('sequence must be a positive integer');
  }
  if (sequence > 999_999) {
    throw new Error('sequence is too large');
  }
  return `${prefix}-${String(sequence).padStart(NUMBER_PAD, '0')}`;
}

export function formatSeriesNumber(docType: DocumentType, sequence: number): string {
  return formatDocumentNumber(SERIES_PREFIXES[docType], sequence);
}

const NUMBER_PATTERN = /^([A-Z]{1,6})-(\d{4,6})$/;

export function parseDocumentNumber(value: string): { prefix: string; sequence: number } | null {
  const match = NUMBER_PATTERN.exec(value);
  if (!match) return null;
  const prefix = match[1];
  const digits = match[2];
  if (!prefix || !digits) return null;
  return { prefix, sequence: Number(digits) };
}
