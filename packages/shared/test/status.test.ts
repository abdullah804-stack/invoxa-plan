import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarDateInTimeZone,
  canDelete,
  canTransition,
  deriveStatus,
  isEditable,
  type StatusInput,
} from '../src/index.js';

const base: StatusInput = {
  docType: 'invoice',
  status: 'sent',
  total: 132000,
  paid: 0,
  dueDate: '2026-12-01',
  today: '2026-11-21',
};

describe('status derivation', () => {
  it('stored draft stays draft', () => {
    expect(deriveStatus({ ...base, status: 'draft' })).toBe('draft');
  });

  it('stored void stays void and is excluded from totals', () => {
    expect(deriveStatus({ ...base, status: 'void' })).toBe('void');
  });

  it('stored paid stays paid', () => {
    expect(deriveStatus({ ...base, status: 'paid', paid: 132000 })).toBe('paid');
  });

  it('partial when something is paid but a balance remains', () => {
    expect(deriveStatus({ ...base, paid: 40000 })).toBe('partial');
  });

  it('overdue when the due date is before today with a balance', () => {
    expect(deriveStatus({ ...base, dueDate: '2026-11-20' })).toBe('overdue');
  });

  it('not overdue on the due date itself', () => {
    expect(deriveStatus({ ...base, dueDate: '2026-11-21' })).toBe('sent');
  });

  it('not overdue once fully paid', () => {
    expect(
      deriveStatus({
        ...base,
        status: 'paid',
        paid: 132000,
        dueDate: '2026-01-01',
      }),
    ).toBe('paid');
  });

  it('expired applies to estimates past valid-until', () => {
    expect(
      deriveStatus({
        docType: 'estimate',
        status: 'sent',
        total: 10000,
        paid: 0,
        dueDate: '2026-12-01',
        validUntil: '2026-11-01',
        today: '2026-11-21',
      }),
    ).toBe('expired');
  });

  it('a credit note has no overdue or expired state', () => {
    expect(
      deriveStatus({
        docType: 'credit_note',
        status: 'sent',
        total: 20000,
        paid: 0,
        dueDate: '2026-01-01',
        today: '2026-11-21',
      }),
    ).toBe('overdue');
  });
});

describe('lifecycle', () => {
  it('allows draft to sent, sent to paid, sent to void, paid back to sent', () => {
    expect(canTransition('draft', 'sent')).toBe(true);
    expect(canTransition('sent', 'paid')).toBe(true);
    expect(canTransition('sent', 'void')).toBe(true);
    expect(canTransition('paid', 'sent')).toBe(true);
  });

  it('void is final and drafts cannot jump to paid', () => {
    expect(canTransition('void', 'sent')).toBe(false);
    expect(canTransition('void', 'draft')).toBe(false);
    expect(canTransition('draft', 'paid')).toBe(false);
  });

  it('only drafts can be deleted', () => {
    expect(canDelete('draft')).toBe(true);
    expect(canDelete('sent')).toBe(false);
    expect(canDelete('paid')).toBe(false);
  });

  it('issued documents are locked for edits', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('sent')).toBe(false);
  });
});

describe('dates', () => {
  it('uses the user time zone for the calendar date', () => {
    const instant = new Date('2026-11-21T23:30:00Z');
    expect(calendarDateInTimeZone(instant, 'UTC')).toBe('2026-11-21');
    expect(calendarDateInTimeZone(instant, 'Asia/Karachi')).toBe('2026-11-22');
  });

  it('falls back to UTC for an unknown time zone', () => {
    const instant = new Date('2026-11-21T23:30:00Z');
    expect(calendarDateInTimeZone(instant, 'Not/AZone')).toBe('2026-11-21');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-21', 14)).toBe('2026-12-05');
  });
});
