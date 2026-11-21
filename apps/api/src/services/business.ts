import type { z } from 'zod';
import type { businessInputSchema } from '@invoxa/shared';
import type { BusinessRecord } from '../models/business.js';

export type BusinessUpdate = Partial<z.infer<typeof businessInputSchema>>;

/** Defaults applied when registration creates the first business. */
export function defaultBusinessFields(name: string): Record<string, unknown> {
  return {
    name,
    brand: {
      color: '#1F5F4A',
      template: 'classic',
      fontPair: 'manrope-inter',
      headerLayout: 'logo-left',
    },
    pageSize: 'A4',
    language: 'en',
    payment: {},
    numbering: { invoice: 'INV', estimate: 'EST', credit_note: 'CN' },
    counters: { invoice: 0, estimate: 0, credit_note: 0 },
    defaultCurrency: 'USD',
    taxRateBp: 0,
    taxMode: 'added',
    dueDays: 14,
    taxPresets: [],
    timeRounding: 'none',
    lateFee: { enabled: false, type: 'percent', value: 0, graceDays: 0 },
    reminders: { enabled: true, hour: 9, daysBefore: 2 },
  };
}

export function serializeBusiness(business: BusinessRecord & { _id?: unknown }) {
  const brand = business.brand ?? {};
  const payment = business.payment ?? {};
  const numbering = business.numbering ?? {};
  const lateFee = business.lateFee ?? {};
  const reminders = business.reminders ?? {};

  return {
    id: String(business._id),
    name: business.name,
    contactName: business.contactName ?? null,
    email: business.email ?? null,
    phone: business.phone ?? null,
    address: business.address ?? null,
    taxId: business.taxId ?? null,
    website: business.website ?? null,
    currency: business.defaultCurrency ?? 'USD',
    language: business.language ?? 'en',
    pageSize: business.pageSize ?? 'A4',
    taxRateBp: business.taxRateBp ?? 0,
    taxMode: business.taxMode ?? 'added',
    dueDays: business.dueDays ?? 14,
    timeRounding: business.timeRounding ?? 'none',
    branding: {
      color: brand.color ?? '#1F5F4A',
      template: brand.template ?? 'classic',
      fontPair: brand.fontPair ?? 'manrope-inter',
      headerLayout: brand.headerLayout ?? 'logo-left',
      logoAssetId: brand.logoAssetId ? String(brand.logoAssetId) : null,
      signatureAssetId: brand.signatureAssetId ? String(brand.signatureAssetId) : null,
    },
    payment: {
      instructions: payment.instructions ?? null,
      link: payment.link ?? null,
    },
    numbering: {
      invoice: numbering.invoice ?? 'INV',
      estimate: numbering.estimate ?? 'EST',
      credit_note: numbering.credit_note ?? 'CN',
    },
    taxPresets: (business.taxPresets ?? []).map((preset) => ({
      name: preset.name,
      rateBp: preset.rateBp,
      checkedOn: preset.checkedOn ?? null,
      note: preset.note ?? null,
    })),
    lateFee: {
      enabled: lateFee.enabled ?? false,
      type: lateFee.type ?? 'percent',
      value: lateFee.value ?? 0,
      graceDays: lateFee.graceDays ?? 0,
    },
    reminders: {
      enabled: reminders.enabled ?? true,
      hour: reminders.hour ?? 9,
      daysBefore: reminders.daysBefore ?? 2,
    },
  };
}

/**
 * Applies a validated update. Renamed fields (currency, branding) are mapped
 * onto the stored document here so the wire format stays clean.
 */
export function applyBusinessUpdate(business: BusinessRecord, input: BusinessUpdate): void {
  if (input.name !== undefined) business.name = input.name;
  if (input.contactName !== undefined) business.contactName = input.contactName;
  if (input.email !== undefined) business.email = input.email;
  if (input.phone !== undefined) business.phone = input.phone;
  if (input.address !== undefined) business.address = input.address;
  if (input.taxId !== undefined) business.taxId = input.taxId;
  if (input.website !== undefined) business.website = input.website;
  if (input.currency !== undefined) business.defaultCurrency = input.currency;
  if (input.language !== undefined) business.language = input.language;
  if (input.pageSize !== undefined) business.pageSize = input.pageSize;
  if (input.taxRateBp !== undefined) business.taxRateBp = input.taxRateBp;
  if (input.taxMode !== undefined) business.taxMode = input.taxMode;
  if (input.dueDays !== undefined) business.dueDays = input.dueDays;
  if (input.timeRounding !== undefined) business.timeRounding = input.timeRounding;

  if (input.branding !== undefined) {
    business.brand = { ...(business.brand ?? {}), ...input.branding } as typeof business.brand;
  }
  if (input.payment !== undefined) {
    business.payment = {
      ...(business.payment ?? {}),
      ...input.payment,
    } as typeof business.payment;
  }
  if (input.numbering !== undefined) {
    business.numbering = {
      ...(business.numbering ?? {}),
      ...input.numbering,
    } as typeof business.numbering;
  }
  if (input.lateFee !== undefined) {
    business.lateFee = { ...(business.lateFee ?? {}), ...input.lateFee } as typeof business.lateFee;
  }
  if (input.reminders !== undefined) {
    business.reminders = {
      ...(business.reminders ?? {}),
      ...input.reminders,
    } as typeof business.reminders;
  }
  if (input.taxPresets !== undefined) {
    business.taxPresets = input.taxPresets.map((preset) => ({
      name: preset.name,
      rateBp: preset.rateBp,
      ...(preset.checkedOn ? { checkedOn: preset.checkedOn } : {}),
      ...(preset.note ? { note: preset.note } : {}),
    })) as typeof business.taxPresets;
  }
}
