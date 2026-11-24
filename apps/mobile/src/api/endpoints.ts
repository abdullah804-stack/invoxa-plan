import { apiRequest } from './client';
import type {
  AiDraftResponse,
  BrandAsset,
  Business,
  BusinessRef,
  Client,
  ClientDetailResponse,
  ClientListParams,
  ClientListResponse,
  DocumentDraftBody,
  DocumentListParams,
  DocumentListResponse,
  DocumentRecord,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseListResponse,
  PaymentInput,
  Profile,
  Project,
  ProjectDetailResponse,
  ProjectInput,
  ProjectStatus,
  TimeEntry,
  TimeEntryInput,
  TimeEntryListResponse,
  RecurringSchedule,
  ReminderList,
  SavedItem,
  Summary,
  User,
} from './types';

export interface AuthResponse {
  token: string;
  user: User;
  business?: BusinessRef;
}

export interface MeResponse {
  user: User;
  businesses: BusinessRef[];
}

export interface ProfileUpdate {
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  website?: string;
  currency?: string;
  branding?: {
    color: string;
    template?: 'classic' | 'modern' | 'minimal';
    fontPair?: 'manrope-inter' | 'lora-inter' | 'space-grotesk-inter';
    headerLayout?: 'logo-left' | 'logo-right' | 'centered';
  };
  reminders?: { enabled?: boolean; hour?: number; daysBefore?: number };
}

export function registerAccount(input: {
  name: string;
  email: string;
  password: string;
  businessName?: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: input });
}

export function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input });
}

export function fetchMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me');
}

export function fetchProfile(): Promise<Profile> {
  return apiRequest<Profile>('/profile');
}

export function updateProfile(input: ProfileUpdate): Promise<Profile> {
  return apiRequest<Profile>('/profile', { method: 'PUT', body: input });
}

export function uploadLogo(dataUrl: string): Promise<{ logo: { id: string; dataUrl: string } }> {
  return apiRequest('/profile/logo', { method: 'PUT', body: { dataUrl } });
}

export function removeLogo(): Promise<{ logo: null }> {
  return apiRequest('/profile/logo', { method: 'DELETE' });
}

export function draftWithAi(input: {
  prompt: string;
  docType: 'invoice' | 'estimate' | 'credit_note';
}): Promise<AiDraftResponse> {
  return apiRequest<AiDraftResponse>('/ai/draft', {
    method: 'POST',
    body: input,
    timeoutMs: 35_000,
  });
}

export function fetchBrandAsset(id: string): Promise<{ asset: BrandAsset }> {
  return apiRequest<{ asset: BrandAsset }>(`/brand-assets/${id}`);
}

export function listDocuments(params: DocumentListParams): Promise<DocumentListResponse> {
  return apiRequest<DocumentListResponse>('/invoices', {
    query: {
      docType: params.docType,
      status: params.status,
      clientId: params.clientId,
      q: params.q,
      sort: params.sort,
      limit: params.limit,
      cursor: params.cursor,
    },
  });
}

export function fetchDocument(id: string): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}`);
}

export function createDocument(
  input: DocumentDraftBody & {
    clientUuid: string;
    docType: 'invoice' | 'estimate' | 'credit_note';
  },
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>('/invoices', { method: 'POST', body: input });
}

export function updateDocument(
  id: string,
  input: Partial<DocumentDraftBody>,
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function issueDocument(
  id: string,
  input: { issueDate?: string; dueDate?: string },
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}/issue`, {
    method: 'POST',
    body: input,
  });
}

export function deleteDocument(id: string): Promise<null> {
  return apiRequest<null>(`/invoices/${id}`, { method: 'DELETE' });
}

export function recordPayment(
  id: string,
  input: PaymentInput,
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}/payments`, {
    method: 'POST',
    body: input,
  });
}

export function setDocumentStatus(
  id: string,
  status: 'sent' | 'paid' | 'void',
): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}/status`, {
    method: 'POST',
    body: { status },
  });
}

export function listClients(params: ClientListParams): Promise<ClientListResponse> {
  return apiRequest<ClientListResponse>('/clients', {
    query: { q: params.q, archived: params.archived, limit: params.limit },
  });
}

export function fetchClient(id: string): Promise<ClientDetailResponse> {
  return apiRequest<ClientDetailResponse>(`/clients/${id}`);
}

export interface ClientInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  archived?: boolean;
}

export function createClient(input: ClientInput): Promise<{ client: Client }> {
  return apiRequest<{ client: Client }>('/clients', { method: 'POST', body: input });
}

export function updateClient(id: string, input: ClientInput): Promise<{ client: Client }> {
  return apiRequest<{ client: Client }>(`/clients/${id}`, { method: 'PUT', body: input });
}

export function deleteClient(id: string): Promise<{ archived?: boolean } | null> {
  return apiRequest<{ archived?: boolean } | null>(`/clients/${id}`, { method: 'DELETE' });
}

export function listSavedItems(): Promise<{ savedItems: SavedItem[] }> {
  return apiRequest<{ savedItems: SavedItem[] }>('/saved-items');
}

export function createSavedItem(input: {
  description: string;
  unitPrice: number;
  currency: string;
}): Promise<{ savedItem: SavedItem }> {
  return apiRequest<{ savedItem: SavedItem }>('/saved-items', { method: 'POST', body: input });
}

export function duplicateDocument(id: string): Promise<{ document: DocumentRecord }> {
  return apiRequest<{ document: DocumentRecord }>(`/invoices/${id}/duplicate`, {
    method: 'POST',
    body: {},
  });
}

export function fetchSummary(): Promise<Summary> {
  return apiRequest<Summary>('/reports/summary');
}

export function fetchReminders(): Promise<ReminderList> {
  return apiRequest<ReminderList>('/reminders');
}

export function listRecurring(): Promise<{ schedules: RecurringSchedule[] }> {
  return apiRequest<{ schedules: RecurringSchedule[] }>('/recurring');
}

export function createRecurring(input: {
  documentId: string;
  interval: 'weekly' | 'monthly' | 'yearly';
  intervalCount?: number;
  startDate?: string;
  dueDays?: number;
  endDate?: string;
}): Promise<{ schedule: RecurringSchedule }> {
  return apiRequest<{ schedule: RecurringSchedule }>('/recurring', { method: 'POST', body: input });
}

export function updateRecurring(
  id: string,
  input: {
    interval?: 'weekly' | 'monthly' | 'yearly';
    intervalCount?: number;
    dueDays?: number;
    endDate?: string | null;
    active?: boolean;
  },
): Promise<{ schedule: RecurringSchedule }> {
  return apiRequest<{ schedule: RecurringSchedule }>(`/recurring/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function deleteRecurring(id: string): Promise<void> {
  return apiRequest<void>(`/recurring/${id}`, { method: 'DELETE' });
}

export function runRecurring(): Promise<{
  created: number;
  schedules: number;
  documents: string[];
}> {
  return apiRequest<{ created: number; schedules: number; documents: string[] }>('/recurring/run', {
    method: 'POST',
    body: {},
  });
}

export type { Business, DocumentRecord };

export function listExpenses(
  params: {
    from?: string;
    to?: string;
    category?: ExpenseCategory;
    limit?: number;
  } = {},
): Promise<ExpenseListResponse> {
  return apiRequest<ExpenseListResponse>('/expenses', {
    query: {
      from: params.from,
      to: params.to,
      category: params.category,
      limit: params.limit,
    },
  });
}

export function fetchExpense(id: string): Promise<{ expense: Expense }> {
  return apiRequest<{ expense: Expense }>(`/expenses/${id}`);
}

export function createExpense(input: ExpenseInput): Promise<{ expense: Expense }> {
  return apiRequest<{ expense: Expense }>('/expenses', { method: 'POST', body: input });
}

export function updateExpense(
  id: string,
  input: Partial<ExpenseInput>,
): Promise<{ expense: Expense }> {
  return apiRequest<{ expense: Expense }>(`/expenses/${id}`, { method: 'PUT', body: input });
}

export function deleteExpense(id: string): Promise<void> {
  return apiRequest<void>(`/expenses/${id}`, { method: 'DELETE' });
}

export function listProjects(
  params: {
    status?: ProjectStatus;
    clientId?: string;
    limit?: number;
  } = {},
): Promise<{ projects: Project[] }> {
  return apiRequest<{ projects: Project[] }>('/projects', {
    query: { status: params.status, clientId: params.clientId, limit: params.limit },
  });
}

export function fetchProject(id: string): Promise<ProjectDetailResponse> {
  return apiRequest<ProjectDetailResponse>(`/projects/${id}`);
}

export function createProject(input: ProjectInput): Promise<{ project: Project }> {
  return apiRequest<{ project: Project }>('/projects', { method: 'POST', body: input });
}

export function updateProject(
  id: string,
  input: Partial<ProjectInput>,
): Promise<{ project: Project }> {
  return apiRequest<{ project: Project }>(`/projects/${id}`, { method: 'PUT', body: input });
}

export function deleteProject(id: string): Promise<void> {
  return apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
}

export function listTimeEntries(
  params: {
    projectId?: string;
    from?: string;
    to?: string;
    unbilled?: 'true' | 'false';
    limit?: number;
  } = {},
): Promise<TimeEntryListResponse> {
  return apiRequest<TimeEntryListResponse>('/time-entries', {
    query: {
      projectId: params.projectId,
      from: params.from,
      to: params.to,
      unbilled: params.unbilled,
      limit: params.limit,
    },
  });
}

export function createTimeEntry(input: TimeEntryInput): Promise<{ entry: TimeEntry }> {
  return apiRequest<{ entry: TimeEntry }>('/time-entries', { method: 'POST', body: input });
}

export function deleteTimeEntry(id: string): Promise<void> {
  return apiRequest<void>(`/time-entries/${id}`, { method: 'DELETE' });
}

export function billProjectTime(
  id: string,
  input: { dueDays?: number } = {},
): Promise<{ document: DocumentRecord; billedMinutes: number; entries: number }> {
  return apiRequest<{ document: DocumentRecord; billedMinutes: number; entries: number }>(
    `/projects/${id}/bill`,
    { method: 'POST', body: input },
  );
}
