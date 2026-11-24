import { describe, expect, it } from 'vitest';
import { addMonthsClamped, nextRunDate } from '../src/recurring.js';

describe('recurring dates', () => {
  it('adds days for a weekly schedule', () => {
    expect(nextRunDate('2026-11-24', '2026-11-24', 'weekly', 1)).toBe('2026-12-01');
    expect(nextRunDate('2026-11-24', '2026-11-24', 'weekly', 2)).toBe('2026-12-08');
  });

  it('keeps the start day across short months and returns to it', () => {
    const start = '2026-01-31';
    const february = nextRunDate('2026-01-31', start, 'monthly', 1);
    const march = nextRunDate(february, start, 'monthly', 1);

    expect(february).toBe('2026-02-28');
    expect(march).toBe('2026-03-31');
  });

  it('clamps to leap day and keeps 29 February yearly', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(nextRunDate('2024-02-29', '2024-02-29', 'yearly', 1)).toBe('2025-02-28');
    const back = nextRunDate('2025-02-28', '2024-02-29', 'yearly', 1);
    expect(back).toBe('2026-02-28');
  });

  it('supports every N months', () => {
    expect(nextRunDate('2026-01-31', '2026-01-31', 'monthly', 3)).toBe('2026-04-30');
    expect(nextRunDate('2026-11-30', '2026-11-30', 'yearly', 1)).toBe('2027-11-30');
  });

  it('refuses a non-positive or silly interval count', () => {
    expect(() => nextRunDate('2026-01-01', '2026-01-01', 'monthly', 0)).toThrow();
    expect(() => nextRunDate('2026-01-01', '2026-01-01', 'monthly', 1.5)).toThrow();
  });
});
