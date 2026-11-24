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
  /** Tracked time this line was grouped from, when it was pulled from a project. */
  timeEntryIds?: string[];
}

export interface DocumentBrandSnapshot {
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  website: string | null;
  branding: Branding;
  paymentInstructions: string | null;
  paymentLink: string | null;
  pageSize: 'A4' | 'LETTER';
  language: string;
}

export interface DocumentAdjustment {
  id: string;
  type: 'late_fee';
  amount: number;
  basisPoints?: number;
  appliedAt: string;
  effectiveDate: string | null;
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
  projectId: string | null;
  clientSnapshot: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
  } | null;
  brandSnapshot: DocumentBrandSnapshot | null;
  adjustments: DocumentAdjustment[];
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
  timeEntryIds?: string[];
}

/** Body for creating or updating a draft; totals are always computed by the server. */
export interface DocumentDraftBody {
  clientId?: string;
  clientSnapshot?: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    taxId?: string | null;
  };
  source?: 'manual' | 'prompt' | 'voice' | 'recurring' | 'duplicate' | 'estimate' | 'time';
  /** An optional project to point the draft at, null to unlink it. */
  projectId?: string | null;
  /** Also pull the project's unbilled billable time onto this draft. */
  billProjectTime?: boolean;
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

export interface AiDraftItem {
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export interface AiDraftSuggestion {
  clientName?: string;
  currency: string;
  items: AiDraftItem[];
  discount?: { type: 'percent'; valueBp: number } | { type: 'fixed'; valueMinor: number } | null;
  taxRateBp?: number;
  taxMode?: 'added' | 'included';
  notes?: string;
}

export interface AiDraftResponse {
  draft: AiDraftSuggestion;
  remaining: number;
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

export interface ReminderItem {
  id: string;
  number: string | null;
  clientName: string | null;
  dueDate: string;
  currency: string;
  balance: number;
  total: number;
  daysUntilDue: number;
}

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  daysBefore: number;
}

export interface ReminderList {
  settings: ReminderSettings;
  today: string;
  counts: { overdue: number; dueSoon: number };
  overdue: ReminderItem[];
  dueSoon: ReminderItem[];
}

export interface RecurringSchedule {
  id: string;
  documentId: string;
  clientId: string | null;
  clientName: string | null;
  currency: string;
  items: DocumentLineItem[];
  discount: { type: 'percent'; valueBp: number } | { type: 'fixed'; valueMinor: number } | null;
  taxRateBp: number;
  taxMode: 'added' | 'included';
  interval: 'weekly' | 'monthly' | 'yearly';
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  dueDays: number;
  active: boolean;
  lastRunAt: string | null;
  lastDocumentId: string | null;
  lastError: string | null;
  createdAt: string;
}

export type ExpenseCategory =
  'software' | 'travel' | 'meals' | 'supplies' | 'equipment' | 'fees' | 'other';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  taxMinor: number;
  notes: string | null;
  createdAt: string;
}

export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  description: string;
  vendor?: string;
  amount: number;
  currency: string;
  taxMinor?: number;
  notes?: string;
}

export interface ExpenseTotal {
  currency: string;
  amount: number;
  count: number;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  totals: ExpenseTotal[];
  month: { from: string; to: string; totals: ExpenseTotal[] };
}

export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  status: ProjectStatus;
  currency: string;
  hourlyRateMinor: number | null;
  budgetMinor: number | null;
  startDate: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ProjectTime {
  minutes: number;
  billableMinutes: number;
  unbilledMinutes: number;
  valueMinor: number;
  unbilledValueMinor: number;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  date: string;
  minutes: number;
  description: string;
  hourlyRateMinor: number;
  currency: string;
  billable: boolean;
  billedDocumentId: string | null;
  createdAt: string;
}

export interface ProjectDocumentSummary {
  id: string;
  number: string | null;
  docType: 'invoice' | 'estimate' | 'credit_note';
  status: 'draft' | 'sent' | 'paid' | 'void';
  issueDate: string | null;
  currency: string;
  total: number;
  paid: number;
  dueDate: string | null;
  createdAt: string;
}

export interface ProjectDetailResponse {
  project: Project;
  time: ProjectTime;
  entries: TimeEntry[];
  documents: ProjectDocumentSummary[];
}

export interface ProjectInput {
  name: string;
  clientId?: string;
  status: ProjectStatus;
  currency: string;
  hourlyRateMinor?: number;
  budgetMinor?: number;
  startDate?: string;
  dueDate?: string;
  notes?: string;
}

export interface TimeEntryInput {
  projectId: string;
  date: string;
  minutes: number;
  description: string;
  hourlyRateMinor: number;
  billable: boolean;
}

export interface TimeEntryListResponse {
  entries: TimeEntry[];
  totals: ProjectTime;
}
