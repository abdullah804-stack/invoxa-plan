/**
 * Wire shapes returned by the M3 API. These mirror `serializeDocument`,
 * `serializeClient` and `serializeBusiness` on the server; the app never builds
 * its own totals, it shows what the server computed.
 */

import type { Role, ShownStatus, StoredDocumentStatus } from '@invoxa/shared';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface BusinessRef {
  id: string;
  name: string;
  role: Role;
}

export interface Branding {
  color: string;
  template: 'classic' | 'modern' | 'minimal';
  fontPair: 'manrope-inter' | 'lora-inter' | 'space-grotesk-inter';
  headerLayout: 'logo-left' | 'logo-right' | 'centered';
  logoAssetId: string | null;
  signatureAssetId: string | null;
}

export interface Business {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  website: string | null;
  currency: string;
  language: string;
  pageSize: 'A4' | 'LETTER';
  taxRateBp: number;
  taxMode: 'added' | 'included';
  dueDays: number;
  timeRounding: 'none' | '5' | '15';
  branding: Branding;
  payment: { instructions: string | null; link: string | null };
  numbering: { invoice: string; estimate: string; credit_note: string };
  taxPresets: { name: string; rateBp: number; checkedOn: string | null; note: string | null }[];
  lateFee: { enabled: boolean; type: 'percent' | 'fixed'; value: number; graceDays: number };
  reminders: { enabled: boolean; hour: number; daysBefore: number };
}

export interface BrandAsset {
  id: string;
  mime: string;
  size: number;
  dataUrl: string;
}

export interface Profile {
  business: Business;
  logo: BrandAsset | null;
  signature: BrandAsset | null;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string | null;
}

export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountBp?: number;
  unit?: string;
}

export interface DocumentPayment {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  creditNoteId: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  base: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export interface DocumentRecord {
  id: string;
  clientUuid: string;
  docType: 'invoice' | 'estimate' | 'credit_note';
  number: string | null;
  status: StoredDocumentStatus;
  shownStatus: ShownStatus;
  clientId: string | null;
  clientName: string | null;
  clientSnapshot: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
  } | null;
  items: DocumentLineItem[];
  currency: string;
  discount: { type: 'percent'; valueBp: number } | { type: 'fixed'; valueMinor: number } | null;
  taxRateBp: number;
  taxMode: 'added' | 'included';
  issueDate: string | null;
  dueDate: string | null;
  validUntil: string | null;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  source: string;
  payments: DocumentPayment[];
  totals: DocumentTotals;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentListResponse {
  documents: DocumentRecord[];
  nextCursor: string | null;
}

export interface DocumentListParams {
  docType?: 'invoice' | 'estimate' | 'credit_note';
  clientId?: string;
  status?: 'draft' | 'sent' | 'paid' | 'void' | 'partial' | 'overdue' | 'expired';
  q?: string;
  sort?: 'newest' | 'oldest' | 'dueDate' | 'amount';
  limit?: number;
  cursor?: string;
}

export interface CurrencySummary {
  currency: string;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export interface SavedItem {
  id: string;
  description: string;
  unitPrice: number;
  currency: string;
}

export interface ClientCurrencySummary {
  currency: string;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export interface ClientDetailResponse {
  client: Client;
  currencies: ClientCurrencySummary[];
  documents: DocumentRecord[];
}

export interface ClientListParams {
  q?: string;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
}

export interface ClientListResponse {
  clients: Client[];
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'cheque' | 'other';

export interface DocumentDraftItemInput {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountBp?: number;
  unit?: string;
}

/** Body for creating or updating a draft; totals are always computed by the server. */
export interface DocumentDraftBody {
  clientId?: string;
  items: DocumentDraftItemInput[];
  currency: string;
  discount?: { type: 'percent'; valueBp: number } | { type: 'fixed'; valueMinor: number } | null;
  taxRateBp?: number;
  taxMode?: 'added' | 'included';
  issueDate?: string;
  dueDate?: string;
  validUntil?: string;
  reference?: string;
  notes?: string;
  terms?: string;
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  reference?: string;
  note?: string;
}

export interface Summary {
  today: string;
  currencies: CurrencySummary[];
  counts: { draft: number; sent: number; paid: number; void: number; overdue: number };
  dueSoon: DocumentRecord[];
  recent: DocumentRecord[];
}
