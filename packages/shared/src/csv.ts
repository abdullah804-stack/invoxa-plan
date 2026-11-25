import { minorToMajorString } from './format.js';
import { DOCUMENT_TITLES, EXPENSE_CATEGORY_LABELS } from './labels.js';
import type { DocumentType } from './status.js';
import type { ExpenseCategory } from './schemas/enums.js';

/**
 * CSV export (plan section "Exports").
 *
 * Excel needs a byte-order mark or it mangles accented names, and it opens a
 * comma file with CRLF line endings most reliably. Amounts are written as plain
 * decimals in the invoice currency, not as formatted money, so a spreadsheet can
 * add the column up.
 *
 * A text cell that starts with = + @ or a dash-word is prefixed with an
 * apostrophe: a client called "=cmd|..." must never become a formula.
 */

export type CsvValue = string | number | null | undefined;

function safeText(text: string): string {
  return /^[=+@\t\r]/.test(text) || /^-(?![0-9.,])/.test(text) ? `'${text}` : text;
}

export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? safeText(value) : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A RFC 4180 file with a BOM. Every export in the product goes through here. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function amount(minor: number, currency: string): string {
  try {
    return minorToMajorString(minor, currency);
  } catch {
    return String(minor);
  }
}

export interface CsvDocument {
  docType: DocumentType;
  number: string | null;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  clientName: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  reference: string | null;
}

export function documentsCsv(documents: readonly CsvDocument[]): string {
  return toCsv(
    [
      'Type',
      'Number',
      'Status',
      'Issue date',
      'Due date',
      'Client',
      'Currency',
      'Subtotal',
      'Discount',
      'Tax',
      'Total',
      'Paid',
      'Balance',
      'Reference',
    ],
    documents.map((document) => [
      DOCUMENT_TITLES[document.docType],
      document.number ?? '',
      document.status,
      document.issueDate ?? '',
      document.dueDate ?? '',
      document.clientName ?? '',
      document.currency,
      amount(document.subtotal, document.currency),
      amount(document.discount, document.currency),
      amount(document.tax, document.currency),
      amount(document.total, document.currency),
      amount(document.paid, document.currency),
      amount(document.balance, document.currency),
      document.reference ?? '',
    ]),
  );
}

export interface CsvExpense {
  date: string;
  category: ExpenseCategory;
  vendor: string | null;
  description: string;
  amount: number;
  taxMinor: number;
  currency: string;
  billable: boolean;
  notes: string | null;
}

export function expensesCsv(expenses: readonly CsvExpense[]): string {
  return toCsv(
    ['Date', 'Category', 'Vendor', 'Description', 'Amount', 'Tax', 'Currency', 'Billable', 'Notes'],
    expenses.map((expense) => [
      expense.date,
      EXPENSE_CATEGORY_LABELS[expense.category],
      expense.vendor ?? '',
      expense.description,
      amount(expense.amount, expense.currency),
      amount(expense.taxMinor, expense.currency),
      expense.currency,
      expense.billable ? 'yes' : 'no',
      expense.notes ?? '',
    ]),
  );
}
