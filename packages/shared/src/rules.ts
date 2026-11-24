/**
 * Week 12 rules that both sides must agree on: what a late fee comes to and how
 * tracked minutes are rounded before they become billable time.
 */

/**
 * A late-fee rule is a percentage in basis points (150 = 1.5%) or a fixed
 * amount in minor units. The fee is taken from the invoice balance and rounded
 * once, in integer minor units.
 */
export function lateFeeAmount(
  rule: { type: 'percent' | 'fixed'; value: number },
  baseMinor: number,
): number {
  if (!Number.isInteger(baseMinor) || baseMinor <= 0) return 0;
  if (rule.type === 'fixed') return Math.max(0, Math.round(rule.value));
  return Math.round((baseMinor * Math.max(0, rule.value)) / 10000);
}

/**
 * Whole minutes as the business records them: unrounded, or to the nearest 5 or
 * 15 minutes. A tracked minute is never rounded away to nothing.
 */
export function roundMinutes(minutes: number, rounding: 'none' | '5' | '15'): number {
  const safe = Math.max(1, Math.round(minutes));
  if (rounding === 'none') return safe;
  const step = rounding === '5' ? 5 : 15;
  return Math.max(step, Math.round(safe / step) * step);
}
