import {
  applyBasisPoints,
  assertBasisPoints,
  assertMinorUnits,
  fromBigIntMinor,
  roundHalfAwayFromZero,
  sumMinor,
  type MinorUnits,
} from './money.js';

/**
 * The one totals function in the product (plan section "Totals").
 *
 * Order of operations, exactly as written in the plan:
 *  1. line net   = quantity x unit price x (1 - item discount)
 *  2. subtotal   = sum of line nets
 *  3. discount   = percent ? round(subtotal x bp / 10000) : min(fixed, subtotal)
 *  4. base       = subtotal - discount
 *  5. tax added  : tax = round(base x rate / 10000); total = base + tax
 *  6. tax incl.  : total = base; tax = round(base x rate / (10000 + rate))
 *  7. late fees  : total = base + tax + fees (fees are never taxed)
 *
 * Paid = sum of payments (including applied credit notes), balance = total - paid.
 */

export type TaxMode = 'added' | 'included';

export interface LineItemInput {
  /** Up to 3 decimals, e.g. 1.5 hours. */
  quantity: number;
  /** Integer minor units per unit. */
  unitPrice: MinorUnits;
  /** Optional per-line discount in basis points (1500 = 15%). */
  discountBp?: number;
}

export type InvoiceDiscount =
  { type: 'percent'; valueBp: number } | { type: 'fixed'; valueMinor: MinorUnits };

export interface DocumentTotalsInput {
  items: readonly LineItemInput[];
  /** Invoice-level discount applied after the subtotal. */
  discount?: InvoiceDiscount | null;
  taxRateBp?: number;
  taxMode?: TaxMode;
  /** Late fee adjustments, added after tax and never taxed. */
  lateFeesMinor?: MinorUnits;
  /** Payment amounts in minor units (credit notes count as payments). */
  paymentsMinor?: readonly MinorUnits[];
}

export interface LineTotals {
  quantity: number;
  unitPrice: MinorUnits;
  discountBp: number;
  /** Line net after the item discount, in minor units. */
  net: MinorUnits;
  /** Money removed by the item discount on this line, in minor units. */
  discount: MinorUnits;
}

export interface DocumentTotals {
  lines: LineTotals[];
  /** Sum of line-level discounts, for a discount column in the PDF. */
  lineDiscount: MinorUnits;
  subtotal: MinorUnits;
  discount: MinorUnits;
  base: MinorUnits;
  tax: MinorUnits;
  /** base for tax-added documents, total - tax for tax-included documents. */
  preTax: MinorUnits;
  lateFees: MinorUnits;
  total: MinorUnits;
  paid: MinorUnits;
  balance: MinorUnits;
}

const QUANTITY_SCALE = 1000;
const MAX_QUANTITY = 1_000_000;

export function quantityToMilli(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new Error('quantity must be a finite number');
  }
  if (quantity < 0) {
    throw new Error('quantity cannot be negative');
  }
  if (quantity > MAX_QUANTITY) {
    throw new Error('quantity is too large');
  }
  const milli = Math.round(quantity * QUANTITY_SCALE);
  if (Math.abs(quantity * QUANTITY_SCALE - milli) > 1e-6) {
    throw new Error('quantity has at most 3 decimals');
  }
  return milli;
}

export function computeLineTotals(line: LineItemInput): LineTotals {
  const quantityMilli = BigInt(quantityToMilli(line.quantity));
  assertMinorUnits(line.unitPrice, 'unitPrice');
  if (line.unitPrice < 0) {
    throw new Error('unitPrice cannot be negative');
  }
  const discountBp = line.discountBp ?? 0;
  assertBasisPoints(discountBp, 'item discount');

  const gross = quantityMilli * BigInt(line.unitPrice);
  const net = roundHalfAwayFromZero(
    gross * BigInt(10000 - discountBp),
    BigInt(QUANTITY_SCALE * 10000),
  );
  const grossRounded = roundHalfAwayFromZero(gross, BigInt(QUANTITY_SCALE));

  return {
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountBp,
    net: fromBigIntMinor(net, 'line net'),
    discount: fromBigIntMinor(grossRounded - net, 'line discount'),
  };
}

export function computeInvoiceDiscount(
  subtotal: MinorUnits,
  discount: InvoiceDiscount | null | undefined,
): MinorUnits {
  assertMinorUnits(subtotal, 'subtotal');
  if (!discount) return 0;

  if (discount.type === 'percent') {
    return Math.min(applyBasisPoints(subtotal, discount.valueBp), subtotal);
  }

  assertMinorUnits(discount.valueMinor, 'discount');
  if (discount.valueMinor < 0) {
    throw new Error('discount cannot be negative');
  }
  // A fixed discount larger than the subtotal is capped, never negative.
  return Math.min(discount.valueMinor, subtotal);
}

export function computeTotals(input: DocumentTotalsInput): DocumentTotals {
  const lines: LineTotals[] = [];
  const lineNets: MinorUnits[] = [];
  let lineDiscount = 0;

  for (const item of input.items) {
    const line = computeLineTotals(item);
    lines.push(line);
    lineNets.push(line.net);
    lineDiscount = sumMinor([lineDiscount, line.discount]);
  }

  const subtotal = sumMinor(lineNets);
  const discount = computeInvoiceDiscount(subtotal, input.discount);
  const base = subtotal - discount;

  const taxRateBp = input.taxRateBp ?? 0;
  assertBasisPoints(taxRateBp, 'tax rate');
  const taxMode: TaxMode = input.taxMode ?? 'added';

  const lateFees = input.lateFeesMinor ?? 0;
  assertMinorUnits(lateFees, 'late fee');
  if (lateFees < 0) {
    throw new Error('late fee cannot be negative');
  }

  let tax: MinorUnits;
  let preTax: MinorUnits;
  let totalBeforeFees: MinorUnits;

  if (taxMode === 'included') {
    totalBeforeFees = base;
    tax = fromBigIntMinor(
      roundHalfAwayFromZero(BigInt(base) * BigInt(taxRateBp), BigInt(10000 + taxRateBp)),
      'tax',
    );
    preTax = totalBeforeFees - tax;
  } else {
    tax = applyBasisPoints(base, taxRateBp);
    preTax = base;
    totalBeforeFees = base + tax;
  }

  const total = totalBeforeFees + lateFees;
  const paid = sumMinor(input.paymentsMinor ?? []);
  const balance = total - paid;

  return {
    lines,
    lineDiscount,
    subtotal,
    discount,
    base,
    tax,
    preTax,
    lateFees,
    total,
    paid,
    balance,
  };
}

/** Convenience for the dashboard: outstanding, billed and paid per currency. */
export function computeOutstanding(
  documents: readonly { total: MinorUnits; paid: MinorUnits; status: string }[],
): { billed: MinorUnits; paid: MinorUnits; outstanding: MinorUnits } {
  const live = documents.filter((doc) => doc.status !== 'void' && doc.status !== 'draft');
  const billed = sumMinor(live.map((doc) => doc.total));
  const paid = sumMinor(live.map((doc) => doc.paid));
  return { billed, paid, outstanding: billed - paid };
}

/** Late fee = round(balance at that moment x bp / 10000). */
export function computeLateFee(balance: MinorUnits, bp: number): MinorUnits {
  assertMinorUnits(balance, 'balance');
  if (balance < 0) {
    throw new Error('balance cannot be negative');
  }
  return applyBasisPoints(balance, bp);
}

export interface CreditApplication {
  invoiceTotal: MinorUnits;
  alreadyPaid: MinorUnits;
  credit: MinorUnits;
}

/**
 * Applying a credit note records a payment. It can never exceed the invoice
 * balance; any unapplied amount stays as client credit.
 */
export function applyCreditNote(input: CreditApplication): {
  applied: MinorUnits;
  unapplied: MinorUnits;
  balance: MinorUnits;
} {
  assertMinorUnits(input.invoiceTotal, 'invoiceTotal');
  assertMinorUnits(input.alreadyPaid, 'alreadyPaid');
  assertMinorUnits(input.credit, 'credit');
  if (input.credit < 0) {
    throw new Error('credit cannot be negative');
  }
  const balance = input.invoiceTotal - input.alreadyPaid;
  if (balance < 0) {
    throw new Error('invoice is already overpaid');
  }
  const applied = Math.min(input.credit, balance);
  return { applied, unapplied: input.credit - applied, balance: balance - applied };
}

/** A payment above the balance is rejected, never clamped. */
export function assertPaymentAllowed(balance: MinorUnits, amount: MinorUnits): void {
  assertMinorUnits(balance, 'balance');
  assertMinorUnits(amount, 'payment');
  if (amount <= 0) {
    throw new Error('Payment must be greater than zero');
  }
  if (amount > balance) {
    throw new Error('Payment is larger than the balance due');
  }
}
