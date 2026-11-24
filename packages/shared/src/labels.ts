import type { DocumentType, ShownStatus } from './status.js';
import type { ExpenseCategory } from './schemas/enums.js';

/**
 * English invoice labels. English is required; two extra languages are added in
 * M10 (week 11) with the same keys. Every user-facing string on the PDF and the
 * screens comes from here so translations cannot drift.
 */

export const LABELS = {
  // Document titles
  invoice: 'Invoice',
  estimate: 'Estimate',
  creditNote: 'Credit Note',
  receipt: 'Receipt',
  statement: 'Statement',

  // Parties
  billTo: 'Bill to',
  from: 'From',

  // Dates and references
  issueDate: 'Issue date',
  dueDate: 'Due date',
  validUntil: 'Valid until',
  reference: 'Reference',
  paymentDate: 'Payment date',

  // Table
  description: 'Description',
  quantity: 'Qty',
  unitPrice: 'Unit price',
  discount: 'Discount',
  amount: 'Amount',

  // Totals
  subtotal: 'Subtotal',
  taxAdded: 'Tax',
  taxIncluded: 'Tax (included)',
  total: 'Total',
  amountPaid: 'Amount paid',
  payments: 'Payments',
  balanceDue: 'Balance due',
  lateFee: 'Late fee',
  creditApplied: 'Credit applied',
  clientCredit: 'Client credit',

  // Footer
  paymentInstructions: 'Payment instructions',
  paymentLink: 'Pay online',
  notes: 'Notes',
  terms: 'Terms',
  signature: 'Signature',
  page: 'Page',
  of: 'of',

  // Stamps and derived states
  draft: 'DRAFT',
  paid: 'PAID',
  void: 'VOID',
  overdue: 'Overdue',
  expired: 'Expired',
  unused: 'Unused',

  // Payment methods
  cash: 'Cash',
  bankTransfer: 'Bank transfer',
  card: 'Card',
  mobileMoney: 'Mobile money',
  cheque: 'Cheque',
  creditNoteMethod: 'Credit note',
  other: 'Other',

  // Empty states and actions
  noInvoices: 'No invoices yet. Say your first one.',
  recordPayment: 'Record payment',
  markSent: 'Mark sent',
  sharePdf: 'Share PDF',
} as const;

export type LabelKey = keyof typeof LABELS;

export function label(key: LabelKey): string {
  return LABELS[key];
}

export const DOCUMENT_TITLES: Record<DocumentType, string> = {
  invoice: LABELS.invoice,
  estimate: LABELS.estimate,
  credit_note: LABELS.creditNote,
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software',
  travel: 'Travel',
  meals: 'Meals',
  supplies: 'Supplies',
  equipment: 'Equipment',
  fees: 'Fees',
  other: 'Other',
};

export const STATUS_LABELS: Record<ShownStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Part paid',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
  expired: 'Expired',
};
