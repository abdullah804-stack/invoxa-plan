import { apiRequest } from './client';
import type {
  Business,
  BusinessRef,
  DocumentListParams,
  DocumentListResponse,
  DocumentRecord,
  Profile,
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

export function listDocuments(params: DocumentListParams): Promise<DocumentListResponse> {
  return apiRequest<DocumentListResponse>('/invoices', {
    query: {
      docType: params.docType,
      status: params.status,
      q: params.q,
      sort: params.sort,
      limit: params.limit,
      cursor: params.cursor,
    },
  });
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

export type { Business, DocumentRecord };
