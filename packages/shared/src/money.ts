/**
 * Money primitives.
 *
 * Rule 1 and 9 of the plan: money is a whole number of minor units (cents,
 * paisa, fils) and is never a floating point value. Tax rates and discounts are
 * integers in basis points (1000 bp = 10%). Every rounding step in the product
 * goes through `roundHalfAwayFromZero`, computed with BigInt so large invoices
 * cannot drift.
 */

/** An integer count of minor units, e.g. 132000 = 1320.00 in a 2-decimal currency. */
export type MinorUnits = number;

export const BP_DENOMINATOR = 10000n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertMinorUnits(value: number, field = 'amount'): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`${field} must be an integer count of minor units`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${field} is outside the safe integer range`);
  }
}

export function assertBasisPoints(value: number, field = 'rate'): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) {
    throw new MoneyError(`${field} must be an integer between 0 and 10000 basis points`);
  }
}

/** Divide and round half away from zero. The only rounding rule in Invoxa. */
export function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new MoneyError('Cannot divide by zero');
  }
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  // floor((2n + d) / 2d) is half away from zero once the sign is applied back.
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

export function toBigIntMinor(value: MinorUnits, field = 'amount'): bigint {
  assertMinorUnits(value, field);
  return BigInt(value);
}

export function fromBigIntMinor(value: bigint, field = 'amount'): MinorUnits {
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new MoneyError(`${field} is outside the safe integer range`);
  }
  return asNumber;
}

/** round(amount x bp / 10000) — used for tax, percent discounts and late fees. */
export function applyBasisPoints(amount: MinorUnits, bp: number): MinorUnits {
  assertMinorUnits(amount);
  assertBasisPoints(bp);
  return fromBigIntMinor(roundHalfAwayFromZero(toBigIntMinor(amount) * BigInt(bp), BP_DENOMINATOR));
}

/** Convert a percentage such as 15 (%) to basis points (1500). */
export function percentToBasisPoints(percent: number): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new MoneyError('percent must be a finite number');
  }
  const bp = Math.round(percent * 100);
  assertBasisPoints(bp, 'percent');
  return bp;
}

export function basisPointsToPercent(bp: number): number {
  assertBasisPoints(bp);
  return bp / 100;
}

export function sumMinor(values: readonly MinorUnits[]): MinorUnits {
  let total = 0n;
  for (const value of values) {
    total += toBigIntMinor(value);
  }
  return fromBigIntMinor(total);
}

/** Total of a list of payments, including applied credit notes. */
export function sumPayments(payments: readonly { amount: MinorUnits }[]): MinorUnits {
  return sumMinor(payments.map((payment) => payment.amount));
}
