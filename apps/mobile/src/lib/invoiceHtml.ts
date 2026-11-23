import { addDays, renderInvoiceHtml, type InvoiceTemplate } from '@invoxa/shared';
import type { DocumentRecord, Profile } from '../api/types';

/**
 * Turns a stored document into the shared renderer's input. An issued document
 * uses its frozen brand and client snapshots, so reprinting it later never
 * changes what the client received; a draft falls back to the current profile.
 */

export interface InvoiceAssets {
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
}

export function invoiceFileName(document: Pick<DocumentRecord, 'number' | 'docType'>): string {
  const base = document.number ?? `draft-${document.docType}`;
  return `${base.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}

export function buildInvoiceHtml(
  document: DocumentRecord,
  profile: Profile | undefined,
  assets: InvoiceAssets = {},
): string {
  const snapshot = document.brandSnapshot;
  const business = profile?.business;
  const branding = snapshot?.branding ?? business?.branding;

  return renderInvoiceHtml({
    document: {
      docType: document.docType,
      number: document.number,
      shownStatus: document.shownStatus,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      validUntil: document.validUntil,
      reference: document.reference,
      notes: document.notes,
      terms: document.terms,
      currency: document.currency,
      taxMode: document.taxMode,
      taxRateBp: document.taxRateBp,
      discount: document.discount,
      items: document.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountBp: item.discountBp ?? 0,
        unit: item.unit ?? null,
      })),
      payments: document.payments.map((payment) => ({
        amount: payment.amount,
        method: payment.method,
        paidAt: payment.paidAt,
        reference: payment.reference,
      })),
      lateFeesMinor: document.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0),
    },
    business: {
      name: snapshot?.businessName ?? business?.name ?? 'Your business',
      email: snapshot?.email ?? business?.email ?? null,
      phone: snapshot?.phone ?? business?.phone ?? null,
      address: snapshot?.address ?? business?.address ?? null,
      taxId: snapshot?.taxId ?? business?.taxId ?? null,
      website: snapshot?.website ?? business?.website ?? null,
    },
    client: {
      name: document.clientSnapshot?.name ?? document.clientName ?? 'No client',
      email: document.clientSnapshot?.email ?? null,
      phone: document.clientSnapshot?.phone ?? null,
      address: document.clientSnapshot?.address ?? null,
      taxId: document.clientSnapshot?.taxId ?? null,
    },
    brand: {
      color: branding?.color ?? '#1F5F4A',
      template: branding?.template ?? 'classic',
      headerLayout: branding?.headerLayout ?? 'logo-left',
      fontPair: branding?.fontPair ?? 'manrope-inter',
      pageSize: snapshot?.pageSize ?? business?.pageSize ?? 'A4',
      language: snapshot?.language ?? business?.language ?? 'en',
      logoDataUrl: assets.logoDataUrl ?? null,
      signatureDataUrl: assets.signatureDataUrl ?? null,
      paymentInstructions: snapshot?.paymentInstructions ?? business?.payment?.instructions ?? null,
      paymentLink: snapshot?.paymentLink ?? business?.payment?.link ?? null,
    },
  });
}

interface SampleInvoiceOptions {
  businessName: string;
  color: string;
  template: InvoiceTemplate;
  logoDataUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  currency: string;
  pageSize?: 'A4' | 'LETTER';
  language?: string;
  fontPair?: 'manrope-inter' | 'lora-inter' | 'space-grotesk-inter';
}

/** The onboarding preview: a small real invoice, rendered by the real renderer. */
export function sampleInvoiceHtml(options: SampleInvoiceOptions): string {
  const today = new Date().toISOString().slice(0, 10);

  return renderInvoiceHtml({
    document: {
      docType: 'invoice',
      number: 'INV-0001',
      shownStatus: 'sent',
      issueDate: today,
      dueDate: addDays(today, 14),
      currency: options.currency,
      taxMode: 'added',
      taxRateBp: 0,
      items: [
        { description: 'Design work', quantity: 1, unitPrice: 12000 },
        { description: 'Consultation', quantity: 2, unitPrice: 4000 },
      ],
    },
    business: {
      name: options.businessName.trim() || 'Your business',
      email: options.email ?? null,
      phone: options.phone ?? null,
      address: options.address ?? null,
    },
    client: { name: 'Sample client', email: 'client@example.com' },
    brand: {
      color: options.color,
      template: options.template,
      headerLayout: 'logo-left',
      pageSize: options.pageSize ?? 'A4',
      language: options.language ?? 'en',
      fontPair: options.fontPair ?? 'manrope-inter',
      logoDataUrl: options.logoDataUrl ?? null,
    },
  });
}
