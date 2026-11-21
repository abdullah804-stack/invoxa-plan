import { Types, type HydratedDocument } from 'mongoose';
import type { FastifyRequest } from 'fastify';
import {
  calendarDateInTimeZone,
  computeTotals,
  deriveStatus,
  sumMinor,
  type BrandSnapshot,
  type ClientSnapshot,
  type DocumentTotals,
  type InvoiceDiscount,
  type ShownStatus,
} from '@invoxa/shared';
import type { BusinessRecord } from '../models/business.js';
import type { ClientRecord } from '../models/client.js';
import type { DocumentRecord } from '../models/document.js';

/**
 * Document helpers shared by every route: totals are always computed by the
 * shared function, never by hand, and the wire shape is serialized in one place.
 */

export type DocumentDocument = HydratedDocument<DocumentRecord>;

export function toInvoiceDiscount(
  discount: DocumentRecord['discount'] | null | undefined,
): InvoiceDiscount | null {
  if (!discount || !discount.type) return null;
  if (discount.type === 'percent') {
    return { type: 'percent', valueBp: discount.valueBp ?? 0 };
  }
  return { type: 'fixed', valueMinor: discount.valueMinor ?? 0 };
}

export function totalsFor(doc: DocumentRecord): DocumentTotals {
  return computeTotals({
    items: (doc.items ?? []).map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountBp: item.discountBp ?? 0,
    })),
    discount: toInvoiceDiscount(doc.discount),
    taxRateBp: doc.taxRateBp ?? 0,
    taxMode: doc.taxMode ?? 'added',
    lateFeesMinor: sumMinor((doc.adjustments ?? []).map((adjustment) => adjustment.amount)),
    paymentsMinor: (doc.payments ?? []).map((payment) => payment.amount),
  });
}

/** Recomputes and stores the totals after any change to items or payments. */
export function applyTotals(doc: DocumentDocument): void {
  const totals = totalsFor(doc);
  doc.totals = {
    subtotal: totals.subtotal,
    discount: totals.discount,
    base: totals.base,
    tax: totals.tax,
    total: totals.total,
    paid: totals.paid,
    balance: totals.balance,
  };
}

export function shownStatusFor(doc: DocumentRecord, today: string): ShownStatus {
  const totals = doc.totals ?? totalsFor(doc);
  return deriveStatus({
    docType: doc.docType,
    status: doc.status,
    total: totals.total,
    paid: totals.paid,
    dueDate: doc.dueDate ?? '',
    validUntil: doc.validUntil ?? null,
    today,
  });
}

export function buildClientSnapshot(client: ClientRecord): ClientSnapshot {
  return {
    name: client.name,
    ...(client.email ? { email: client.email } : {}),
    ...(client.phone ? { phone: client.phone } : {}),
    ...(client.address ? { address: client.address } : {}),
    ...(client.taxId ? { taxId: client.taxId } : {}),
  };
}

/** The brand copy frozen onto the document at issue. Asset IDs, not bytes. */
export function buildBrandSnapshot(business: BusinessRecord): BrandSnapshot {
  const brand = business.brand ?? {};
  return {
    businessName: business.name,
    ...(business.contactName ? { contactName: business.contactName } : {}),
    ...(business.email ? { email: business.email } : {}),
    ...(business.phone ? { phone: business.phone } : {}),
    ...(business.address ? { address: business.address } : {}),
    ...(business.taxId ? { taxId: business.taxId } : {}),
    ...(business.website ? { website: business.website } : {}),
    branding: {
      color: brand.color ?? '#1F5F4A',
      template: brand.template ?? 'classic',
      fontPair: brand.fontPair ?? 'manrope-inter',
      headerLayout: brand.headerLayout ?? 'logo-left',
      ...(brand.logoAssetId ? { logoAssetId: String(brand.logoAssetId) } : {}),
      ...(brand.signatureAssetId ? { signatureAssetId: String(brand.signatureAssetId) } : {}),
    },
    ...(business.payment?.instructions
      ? { paymentInstructions: business.payment.instructions }
      : {}),
    ...(business.payment?.link ? { paymentLink: business.payment.link } : {}),
    pageSize: business.pageSize ?? 'A4',
    language: business.language ?? 'en',
  };
}

function idOrNull(value: unknown): string | null {
  return value ? String(value) : null;
}

function serializeDiscount(discount: DocumentRecord['discount']) {
  if (!discount || !discount.type) return null;
  return discount.type === 'percent'
    ? { type: 'percent' as const, valueBp: discount.valueBp ?? 0 }
    : { type: 'fixed' as const, valueMinor: discount.valueMinor ?? 0 };
}

export function serializeDocument(doc: DocumentDocument, today: string) {
  const totals = doc.totals ?? totalsFor(doc);
  const brandSnapshot = doc.brandSnapshot;

  return {
    id: String(doc._id),
    clientUuid: doc.clientUuid,
    docType: doc.docType,
    number: doc.number ?? null,
    status: doc.status,
    shownStatus: shownStatusFor(doc, today),
    clientId: idOrNull(doc.clientId),
    clientName: doc.clientSnapshot?.name ?? null,
    clientSnapshot: doc.clientSnapshot
      ? {
          name: doc.clientSnapshot.name,
          email: doc.clientSnapshot.email ?? null,
          phone: doc.clientSnapshot.phone ?? null,
          address: doc.clientSnapshot.address ?? null,
          taxId: doc.clientSnapshot.taxId ?? null,
        }
      : null,
    projectId: idOrNull(doc.projectId),
    items: (doc.items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discountBp !== undefined && item.discountBp !== null
        ? { discountBp: item.discountBp }
        : {}),
      ...(item.unit ? { unit: item.unit } : {}),
    })),
    currency: doc.currency,
    discount: serializeDiscount(doc.discount),
    taxRateBp: doc.taxRateBp ?? 0,
    taxMode: doc.taxMode ?? 'added',
    issueDate: doc.issueDate ?? null,
    dueDate: doc.dueDate ?? null,
    validUntil: doc.validUntil ?? null,
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    terms: doc.terms ?? null,
    source: doc.source ?? 'manual',
    convertedFrom: idOrNull(doc.convertedFrom),
    brandSnapshot: brandSnapshot
      ? {
          businessName: brandSnapshot.businessName,
          contactName: brandSnapshot.contactName ?? null,
          email: brandSnapshot.email ?? null,
          phone: brandSnapshot.phone ?? null,
          address: brandSnapshot.address ?? null,
          taxId: brandSnapshot.taxId ?? null,
          website: brandSnapshot.website ?? null,
          branding: {
            color: brandSnapshot.branding?.color ?? '#1F5F4A',
            template: brandSnapshot.branding?.template ?? 'classic',
            fontPair: brandSnapshot.branding?.fontPair ?? 'manrope-inter',
            headerLayout: brandSnapshot.branding?.headerLayout ?? 'logo-left',
            logoAssetId: idOrNull(brandSnapshot.branding?.logoAssetId),
            signatureAssetId: idOrNull(brandSnapshot.branding?.signatureAssetId),
          },
          paymentInstructions: brandSnapshot.paymentInstructions ?? null,
          paymentLink: brandSnapshot.paymentLink ?? null,
          pageSize: brandSnapshot.pageSize ?? 'A4',
          language: brandSnapshot.language ?? 'en',
        }
      : null,
    payments: (doc.payments ?? []).map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      reference: payment.reference ?? null,
      note: payment.note ?? null,
      creditNoteId: idOrNull(payment.creditNoteId),
      recordedBy: idOrNull(payment.recordedBy),
      recordedAt: payment.recordedAt ?? null,
    })),
    adjustments: (doc.adjustments ?? []).map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      amount: adjustment.amount,
      ...(adjustment.basisPoints !== undefined && adjustment.basisPoints !== null
        ? { basisPoints: adjustment.basisPoints }
        : {}),
      appliedAt: adjustment.appliedAt,
      appliedBy: idOrNull(adjustment.appliedBy),
      effectiveDate: adjustment.effectiveDate ?? null,
    })),
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      base: totals.base,
      tax: totals.tax,
      total: totals.total,
      paid: totals.paid,
      balance: totals.balance,
    },
    createdAt: doc.createdAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt?.toISOString() ?? null,
    createdBy: idOrNull(doc.createdBy),
  };
}

export function serializeClient(client: ClientRecord & { _id: unknown; createdAt?: Date }) {
  return {
    id: String(client._id),
    name: client.name,
    email: client.email ?? null,
    phone: client.phone ?? null,
    address: client.address ?? null,
    taxId: client.taxId ?? null,
    notes: client.notes ?? null,
    archived: client.archived ?? false,
    createdAt: client.createdAt?.toISOString() ?? null,
  };
}

/** Today's calendar date for the caller, from X-Timezone with a UTC fallback. */
export function requestToday(request: FastifyRequest): string {
  const header = request.headers['x-timezone'];
  const value = Array.isArray(header) ? header[0] : header;
  return calendarDateInTimeZone(new Date(), value?.trim() || 'UTC');
}

export function newLineItemId(): string {
  return new Types.ObjectId().toString();
}
