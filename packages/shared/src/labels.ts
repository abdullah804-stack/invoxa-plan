import type { DocumentType, ShownStatus } from './status.js';
import type { ExpenseCategory } from './schemas/enums.js';

/**
 * Invoice labels in every language Invoxa prints. English is required; Spanish
 * and French are the plan's two extra languages (see docs/decisions.md). Every
 * dictionary has exactly the same keys — a test enforces that — so a screen or a
 * template can never reference a string that exists in only one language.
 *
 * `language` is a BCP 47 tag such as `es` or `fr-CA`; the base language picks
 * the dictionary and unknown languages fall back to English.
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
  asOf: 'As of',
  paymentMethod: 'Payment method',
  scanToPay: 'Scan to pay',
  receivedWithThanks: 'Received with thanks',
  statementFor: 'Statement for',
  openingBalance: 'Opening balance',
  closingBalance: 'Closing balance',

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
export type Labels = Record<LabelKey, string>;

/** Spanish labels for every key in `LABELS`. */
const ES: Labels = {
  invoice: 'Factura',
  estimate: 'Presupuesto',
  creditNote: 'Nota de crédito',
  receipt: 'Recibo',
  statement: 'Estado de cuenta',

  billTo: 'Facturar a',
  from: 'De',

  issueDate: 'Fecha de emisión',
  dueDate: 'Fecha de vencimiento',
  validUntil: 'Válido hasta',
  reference: 'Referencia',
  paymentDate: 'Fecha de pago',
  asOf: 'Al',
  paymentMethod: 'Método de pago',
  scanToPay: 'Escanear para pagar',
  receivedWithThanks: 'Recibido con agradecimiento',
  statementFor: 'Estado de cuenta de',
  openingBalance: 'Saldo inicial',
  closingBalance: 'Saldo final',

  description: 'Descripción',
  quantity: 'Cant.',
  unitPrice: 'Precio unitario',
  discount: 'Descuento',
  amount: 'Importe',

  subtotal: 'Subtotal',
  taxAdded: 'Impuesto',
  taxIncluded: 'Impuesto (incluido)',
  total: 'Total',
  amountPaid: 'Importe pagado',
  payments: 'Pagos',
  balanceDue: 'Saldo pendiente',
  lateFee: 'Recargo por mora',
  creditApplied: 'Crédito aplicado',
  clientCredit: 'Crédito del cliente',

  paymentInstructions: 'Instrucciones de pago',
  paymentLink: 'Pagar en línea',
  notes: 'Notas',
  terms: 'Términos',
  signature: 'Firma',
  page: 'Página',
  of: 'de',

  draft: 'BORRADOR',
  paid: 'PAGADA',
  void: 'ANULADA',
  overdue: 'Vencida',
  expired: 'Caducada',
  unused: 'Sin usar',

  cash: 'Efectivo',
  bankTransfer: 'Transferencia bancaria',
  card: 'Tarjeta',
  mobileMoney: 'Dinero móvil',
  cheque: 'Cheque',
  creditNoteMethod: 'Nota de crédito',
  other: 'Otro',

  noInvoices: 'Aún no hay facturas. Crea la primera.',
  recordPayment: 'Registrar pago',
  markSent: 'Marcar como enviada',
  sharePdf: 'Compartir PDF',
};

/** French labels for every key in `LABELS`. */
const FR: Labels = {
  invoice: 'Facture',
  estimate: 'Devis',
  creditNote: 'Avoir',
  receipt: 'Reçu',
  statement: 'Relevé',

  billTo: 'Facturer à',
  from: 'De',

  issueDate: "Date d'émission",
  dueDate: "Date d'échéance",
  validUntil: "Valable jusqu'au",
  reference: 'Référence',
  paymentDate: 'Date de paiement',
  asOf: 'Au',
  paymentMethod: 'Mode de paiement',
  scanToPay: 'Scanner pour payer',
  receivedWithThanks: 'Reçu avec nos remerciements',
  statementFor: 'Relevé de',
  openingBalance: "Solde d'ouverture",
  closingBalance: 'Solde de clôture',

  description: 'Désignation',
  quantity: 'Qté',
  unitPrice: 'Prix unitaire',
  discount: 'Remise',
  amount: 'Montant',

  subtotal: 'Sous-total',
  taxAdded: 'Taxe',
  taxIncluded: 'Taxe (incluse)',
  total: 'Total',
  amountPaid: 'Montant payé',
  payments: 'Paiements',
  balanceDue: 'Solde dû',
  lateFee: 'Pénalité de retard',
  creditApplied: 'Avoir appliqué',
  clientCredit: 'Crédit client',

  paymentInstructions: 'Instructions de paiement',
  paymentLink: 'Payer en ligne',
  notes: 'Notes',
  terms: 'Conditions',
  signature: 'Signature',
  page: 'Page',
  of: 'sur',

  draft: 'BROUILLON',
  paid: 'PAYÉE',
  void: 'ANNULÉE',
  overdue: 'En retard',
  expired: 'Expirée',
  unused: 'Non utilisé',

  cash: 'Espèces',
  bankTransfer: 'Virement bancaire',
  card: 'Carte',
  mobileMoney: 'Paiement mobile',
  cheque: 'Chèque',
  creditNoteMethod: 'Avoir',
  other: 'Autre',

  noInvoices: "Aucune facture pour l'instant. Créez la première.",
  recordPayment: 'Enregistrer un paiement',
  markSent: 'Marquer comme envoyée',
  sharePdf: 'Partager le PDF',
};

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LABELS_BY_LANGUAGE: Record<SupportedLanguage, Labels> = {
  en: LABELS,
  es: ES,
  fr: FR,
};

/** The supported base language for a tag such as `es-MX`, or `en` if unknown. */
export function resolveLanguage(language?: string | null): SupportedLanguage {
  const base = (language ?? '').trim().toLowerCase().split('-')[0] ?? '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : 'en';
}

export function labelsFor(language?: string | null): Labels {
  return LABELS_BY_LANGUAGE[resolveLanguage(language)];
}

export function label(key: LabelKey, language?: string | null): string {
  return labelsFor(language)[key];
}

/** Titles keyed by document type, in the requested language. */
export function documentTitles(language?: string | null): Record<DocumentType, string> {
  const labels = labelsFor(language);
  return {
    invoice: labels.invoice,
    estimate: labels.estimate,
    credit_note: labels.creditNote,
  };
}

/** English titles, kept for screens that are not translated. */
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
