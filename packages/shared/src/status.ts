import type { MinorUnits } from './money.js';

/**
 * Status rules (plan section "Rules, calculations, statuses and numbering").
 *
 * Only draft, sent, paid and void are stored. Overdue, partial and expired are
 * derived on read so they cannot drift.
 */

export type DocumentType = 'invoice' | 'estimate' | 'credit_note';
export type StoredDocumentStatus = 'draft' | 'sent' | 'paid' | 'void';
export type ShownStatus = StoredDocumentStatus | 'partial' | 'overdue' | 'expired';

export interface StatusInput {
  docType: DocumentType;
  status: StoredDocumentStatus;
  total: MinorUnits;
  paid: MinorUnits;
  /** Calendar date, YYYY-MM-DD, no time zone. */
  dueDate: string;
  /** Estimates only: YYYY-MM-DD. */
  validUntil?: string | null;
  /** Today's calendar date in the user's time zone, YYYY-MM-DD. */
  today: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date`);
  }
}

/** Calendar date comparison is safe as a string compare on YYYY-MM-DD. */
export function isPast(date: string, today: string): boolean {
  assertIsoDate(date, 'date');
  assertIsoDate(today, 'today');
  return date < today;
}

export function deriveStatus(input: StatusInput): ShownStatus {
  const { status } = input;

  // Stored terminal states win and are never recomputed.
  if (status === 'draft') return 'draft';
  if (status === 'void') return 'void';
  if (status === 'paid') return 'paid';

  const total = input.total;
  const paid = input.paid;

  // Precedence follows the order of the table in the plan.
  if (paid > 0 && paid < total) return 'partial';

  if (input.docType === 'estimate') {
    if (input.validUntil && isPast(input.validUntil, input.today)) return 'expired';
    return 'sent';
  }

  const balance = total - paid;
  if (balance > 0 && isPast(input.dueDate, input.today)) return 'overdue';

  return 'sent';
}

export function isOverdue(input: StatusInput): boolean {
  return deriveStatus(input) === 'overdue';
}

export type StoredStatusTransition = { from: StoredDocumentStatus; to: StoredDocumentStatus };

/**
 * Allowed transitions: draft -> sent (issue) or deleted; sent -> paid, void;
 * paid -> sent (undo); void is final.
 */
const ALLOWED: readonly StoredStatusTransition[] = [
  { from: 'draft', to: 'sent' },
  { from: 'sent', to: 'paid' },
  { from: 'sent', to: 'void' },
  { from: 'paid', to: 'sent' },
];

export function canTransition(from: StoredDocumentStatus, to: StoredDocumentStatus): boolean {
  return ALLOWED.some((rule) => rule.from === from && rule.to === to);
}

export function assertTransition(from: StoredDocumentStatus, to: StoredDocumentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot change status from ${from} to ${to}`);
  }
}

/** Drafts can be deleted; issued documents are voided so numbers never repeat. */
export function canDelete(status: StoredDocumentStatus): boolean {
  return status === 'draft';
}

/** Issued documents are locked: items, prices, client and currency are frozen. */
export function isEditable(status: StoredDocumentStatus): boolean {
  return status === 'draft';
}

/**
 * Today's calendar date for a user's time zone, used for the derived overdue
 * and expired states (X-Timezone header, UTC fallback).
 */
export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Invalid time zone falls through to UTC.
  }
  return instant.toISOString().slice(0, 10);
}

/** Add days to a YYYY-MM-DD calendar date without time zone drift. */
export function addDays(isoDate: string, days: number): string {
  assertIsoDate(isoDate, 'date');
  if (!Number.isInteger(days)) throw new Error('days must be an integer');
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
