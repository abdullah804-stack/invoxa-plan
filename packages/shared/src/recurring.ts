/**
 * Recurring schedule dates. A monthly schedule anchored to the 31st must land
 * on the last day of a short month and come back to the 31st afterwards, so the
 * next date is always computed from the start date's day, never from the last
 * clamped result.
 */

export type RecurringInterval = 'weekly' | 'monthly' | 'yearly';

function parts(isoDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Not a calendar date: ${isoDate}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Moves a date by whole months, keeping its day when the month is long enough. */
export function addMonthsClamped(isoDate: string, months: number): string {
  if (!Number.isInteger(months)) throw new Error('months must be an integer');
  const { year, month, day } = parts(isoDate);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  return iso(targetYear, targetMonth, Math.min(day, lastDayOfMonth(targetYear, targetMonth)));
}

/**
 * The occurrence after `from` for a schedule that started on `startDate`.
 * Weekly schedules just add days; monthly and yearly keep the start day.
 */
export function nextRunDate(
  from: string,
  startDate: string,
  interval: RecurringInterval,
  intervalCount: number,
): string {
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 120) {
    throw new Error('intervalCount must be a whole number between 1 and 120');
  }

  if (interval === 'weekly') {
    const { year, month, day } = parts(from);
    const next = new Date(Date.UTC(year, month - 1, day + 7 * intervalCount));
    return next.toISOString().slice(0, 10);
  }

  const anchor = parts(startDate).day;
  const step = interval === 'yearly' ? 12 * intervalCount : intervalCount;
  const current = parts(from);

  let targetYear = current.year;
  let targetMonth = current.month - 1 + step;
  targetYear += Math.floor(targetMonth / 12);
  targetMonth = (targetMonth % 12) + 1;

  const day = Math.min(anchor, lastDayOfMonth(targetYear, targetMonth));
  return iso(targetYear, targetMonth, day);
}
