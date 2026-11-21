import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  applyCreditNote,
  assertPaymentAllowed,
  computeLateFee,
  computeLineTotals,
  computeOutstanding,
  computeTotals,
  majorToMinor,
  percentToBasisPoints,
  roundHalfAwayFromZero,
} from '../src/index.js';

/**
 * Every vector from the build plan's totals table, plus the rounding edges the
 * plan calls out (half away from zero, large values, zero items).
 */

const simple = computeTotals({
  items: [{ quantity: 10, unitPrice: 12000 }],
  taxRateBp: 1000,
  taxMode: 'added',
});

describe('totals: plan vectors', () => {
  it('simple, tax added: 10 hours at 12000 with 10% tax', () => {
    expect(simple.subtotal).toBe(120000);
    expect(simple.discount).toBe(0);
    expect(simple.base).toBe(120000);
    expect(simple.tax).toBe(12000);
    expect(simple.total).toBe(132000);
    expect(simple.balance).toBe(132000);
  });

  it('discount then tax: 10000, 15% discount, 8% tax', () => {
    const totals = computeTotals({
      items: [{ quantity: 1, unitPrice: 10000 }],
      discount: { type: 'percent', valueBp: 1500 },
      taxRateBp: 800,
      taxMode: 'added',
    });

    expect(totals.subtotal).toBe(10000);
    expect(totals.discount).toBe(1500);
    expect(totals.base).toBe(8500);
    expect(totals.tax).toBe(680);
    expect(totals.total).toBe(9180);
  });

  it('tax included: total 10000 at 20% gives tax 1667 and pre-tax 8333', () => {
    const totals = computeTotals({
      items: [{ quantity: 1, unitPrice: 10000 }],
      taxRateBp: 2000,
      taxMode: 'included',
    });

    expect(totals.total).toBe(10000);
    expect(totals.tax).toBe(1667);
    expect(totals.preTax).toBe(8333);
    expect(totals.balance).toBe(10000);
  });

  it('fixed discount larger than the subtotal is capped, not negative', () => {
    const totals = computeTotals({
      items: [{ quantity: 1, unitPrice: 5000 }],
      discount: { type: 'fixed', valueMinor: 9000 },
      taxRateBp: 0,
    });

    expect(totals.discount).toBe(5000);
    expect(totals.base).toBe(0);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('late fee: 150 bp of 132000 is 1980 and is added after tax, untaxed', () => {
    expect(computeLateFee(132000, 150)).toBe(1980);

    const totals = computeTotals({
      items: [{ quantity: 10, unitPrice: 12000 }],
      taxRateBp: 1000,
      taxMode: 'added',
      lateFeesMinor: 1980,
    });

    expect(totals.tax).toBe(12000);
    expect(totals.total).toBe(133980);
    expect(totals.balance).toBe(133980);
  });

  it('credit note applied: 20000 against 132000 leaves 112000', () => {
    const result = applyCreditNote({
      invoiceTotal: 132000,
      alreadyPaid: 0,
      credit: 20000,
    });

    expect(result.applied).toBe(20000);
    expect(result.unapplied).toBe(0);
    expect(result.balance).toBe(112000);

    const totals = computeTotals({
      items: [{ quantity: 10, unitPrice: 12000 }],
      taxRateBp: 1000,
      taxMode: 'added',
      paymentsMinor: [result.applied],
    });

    expect(totals.paid).toBe(20000);
    expect(totals.balance).toBe(112000);
  });
});

describe('totals: edges', () => {
  it('zero items produce zero everywhere', () => {
    const totals = computeTotals({ items: [] });
    expect(totals).toMatchObject({
      subtotal: 0,
      discount: 0,
      base: 0,
      tax: 0,
      total: 0,
      paid: 0,
      balance: 0,
    });
    expect(totals.lines).toHaveLength(0);
  });

  it('rounds half away from zero, never banker rounding', () => {
    expect(roundHalfAwayFromZero(1n, 2n)).toBe(1n);
    expect(roundHalfAwayFromZero(3n, 2n)).toBe(2n);
    expect(roundHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(roundHalfAwayFromZero(-1n, 2n)).toBe(-1n);
    expect(applyBasisPoints(3, 5000)).toBe(2);
    expect(applyBasisPoints(1, 5000)).toBe(1);
    expect(applyBasisPoints(0, 5000)).toBe(0);
  });

  it('handles fractional quantities at 3 decimals', () => {
    expect(computeLineTotals({ quantity: 0.333, unitPrice: 100 }).net).toBe(33);
    expect(computeLineTotals({ quantity: 0.335, unitPrice: 100 }).net).toBe(34);
    expect(computeLineTotals({ quantity: 1.5, unitPrice: 12000 }).net).toBe(18000);
  });

  it('rejects quantities with more than 3 decimals', () => {
    expect(() => computeLineTotals({ quantity: 1.2345, unitPrice: 100 })).toThrow(/3 decimals/);
  });

  it('rejects float money', () => {
    expect(() => computeLineTotals({ quantity: 1, unitPrice: 10.5 })).toThrow(/minor units/);
  });

  it('applies per-line discounts before the subtotal', () => {
    const totals = computeTotals({
      items: [
        { quantity: 2, unitPrice: 5000, discountBp: 1000 },
        { quantity: 1, unitPrice: 1000 },
      ],
    });

    expect(totals.lines[0]?.net).toBe(9000);
    expect(totals.lines[0]?.discount).toBe(1000);
    expect(totals.lineDiscount).toBe(1000);
    expect(totals.subtotal).toBe(10000);
  });

  it('keeps large values exact', () => {
    const totals = computeTotals({
      items: [{ quantity: 1000, unitPrice: 900000000 }],
      taxRateBp: 2000,
    });

    expect(totals.subtotal).toBe(900000000000);
    expect(totals.tax).toBe(180000000000);
    expect(totals.total).toBe(1080000000000);
  });

  it('percent discount is computed on the subtotal with half-away rounding', () => {
    const totals = computeTotals({
      items: [{ quantity: 1, unitPrice: 3 }],
      discount: { type: 'percent', valueBp: 5000 },
    });

    expect(totals.discount).toBe(2);
    expect(totals.total).toBe(1);
  });

  it('converts percentages to basis points', () => {
    expect(percentToBasisPoints(15)).toBe(1500);
    expect(percentToBasisPoints(7.5)).toBe(750);
  });

  it('converts major units to minor units by currency exponent', () => {
    expect(majorToMinor(1320, 'USD')).toBe(132000);
    expect(majorToMinor(1320, 'JPY')).toBe(1320);
    expect(majorToMinor(1.234, 'KWD')).toBe(1234);
  });
});

describe('payments and balance', () => {
  it('rejects a payment above the balance', () => {
    expect(() => assertPaymentAllowed(5000, 5001)).toThrow(/larger than the balance/);
    expect(() => assertPaymentAllowed(5000, 5000)).not.toThrow();
  });

  it('rejects zero or negative payments', () => {
    expect(() => assertPaymentAllowed(5000, 0)).toThrow(/greater than zero/);
  });

  it('caps a credit note at the remaining balance', () => {
    const result = applyCreditNote({ invoiceTotal: 10000, alreadyPaid: 4000, credit: 9000 });
    expect(result.applied).toBe(6000);
    expect(result.unapplied).toBe(3000);
    expect(result.balance).toBe(0);
  });

  it('sums partial payments into the balance', () => {
    const totals = computeTotals({
      items: [{ quantity: 1, unitPrice: 132000 }],
      paymentsMinor: [50000, 20000],
    });

    expect(totals.paid).toBe(70000);
    expect(totals.balance).toBe(62000);
  });
});

describe('outstanding totals per currency', () => {
  it('excludes drafts and void documents', () => {
    const result = computeOutstanding([
      { total: 10000, paid: 0, status: 'sent' },
      { total: 5000, paid: 5000, status: 'paid' },
      { total: 9999, paid: 0, status: 'void' },
      { total: 7777, paid: 0, status: 'draft' },
    ]);

    expect(result.billed).toBe(15000);
    expect(result.paid).toBe(5000);
    expect(result.outstanding).toBe(10000);
  });
});
