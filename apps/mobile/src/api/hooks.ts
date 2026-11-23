import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider';
import {
  createClient,
  createDocument,
  createSavedItem,
  deleteClient,
  deleteDocument,
  draftWithAi,
  duplicateDocument,
  fetchBrandAsset,
  fetchClient,
  fetchDocument,
  fetchProfile,
  fetchSummary,
  issueDocument,
  listClients,
  listDocuments,
  listSavedItems,
  recordPayment,
  removeLogo,
  setDocumentStatus,
  updateClient,
  updateDocument,
  updateProfile,
  uploadLogo,
  type ClientInput,
  type ProfileUpdate,
} from './endpoints';
import type {
  ClientListParams,
  DocumentDraftBody,
  DocumentListParams,
  DocumentRecord,
  PaymentInput,
  Profile,
} from './types';

/**
 * Query keys include the active business, so switching business can never show
 * another business's cached numbers.
 */
export const queryKeys = {
  profile: (businessId: string | null) => ['profile', businessId] as const,
  summary: (businessId: string | null) => ['summary', businessId] as const,
  documents: (businessId: string | null, params: DocumentListParams) =>
    ['documents', businessId, params] as const,
  document: (businessId: string | null, id: string) => ['document', businessId, id] as const,
  clients: (businessId: string | null, params: ClientListParams) =>
    ['clients', businessId, params] as const,
  client: (businessId: string | null, id: string) => ['client', businessId, id] as const,
  savedItems: (businessId: string | null) => ['saved-items', businessId] as const,
  brandAsset: (businessId: string | null, id: string) => ['brand-asset', businessId, id] as const,
};

export function useProfile() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.profile(activeBusinessId),
    queryFn: fetchProfile,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    staleTime: 30_000,
  });
}

export function useSummary() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.summary(activeBusinessId),
    queryFn: fetchSummary,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

/** Cursor paging: each page continues strictly after the last row. */
export function useDocumentPages(params: Omit<DocumentListParams, 'cursor'>) {
  const { status, activeBusinessId } = useSession();
  return useInfiniteQuery({
    queryKey: queryKeys.documents(activeBusinessId, params),
    queryFn: ({ pageParam }) => listDocuments({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

export function useDocument(id: string | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.document(activeBusinessId, id ?? ''),
    queryFn: () => fetchDocument(id as string),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(id),
  });
}

/** A stored logo or signature by ID, used to render issued documents as sent. */
export function useBrandAsset(id: string | null | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.brandAsset(activeBusinessId, id ?? ''),
    queryFn: () => fetchBrandAsset(id as string),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(id),
    staleTime: 5 * 60_000,
  });
}

export function useClients(params: ClientListParams) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.clients(activeBusinessId, params),
    queryFn: () => listClients(params),
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    staleTime: 15_000,
  });
}

export function useClientDetail(id: string | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.client(activeBusinessId, id ?? ''),
    queryFn: () => fetchClient(id as string),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(id),
  });
}

export function useSavedItems() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.savedItems(activeBusinessId),
    queryFn: listSavedItems,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    staleTime: 60_000,
  });
}

/** Any change to a document touches the lists, the summary and that document. */
function useDocumentCacheUpdates() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();

  return (document?: DocumentRecord) => {
    if (document) {
      queryClient.setQueryData(queryKeys.document(activeBusinessId, document.id), {
        document,
      });
    }
    void queryClient.invalidateQueries({ queryKey: ['documents', activeBusinessId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.summary(activeBusinessId) });
    void queryClient.invalidateQueries({ queryKey: ['clients', activeBusinessId] });
    void queryClient.invalidateQueries({ queryKey: ['client', activeBusinessId] });
  };
}

export function useAiDraft() {
  return useMutation({
    mutationFn: (input: { prompt: string; docType: 'invoice' | 'estimate' | 'credit_note' }) =>
      draftWithAi(input),
  });
}

export function useCreateDocument() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: (
      input: DocumentDraftBody & {
        clientUuid: string;
        docType: 'invoice' | 'estimate' | 'credit_note';
      },
    ) => createDocument(input),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useUpdateDocument() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DocumentDraftBody> }) =>
      updateDocument(id, input),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useIssueDocument() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate?: string }) =>
      issueDocument(id, dueDate ? { dueDate } : {}),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useRecordPayment() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PaymentInput }) => recordPayment(id, input),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useSetDocumentStatus() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'sent' | 'paid' | 'void' }) =>
      setDocumentStatus(id, status),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useDeleteDocument() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => onDocumentChange(),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: (input: ClientInput) => createClient(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients', activeBusinessId] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientInput }) => updateClient(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients', activeBusinessId] });
      void queryClient.invalidateQueries({ queryKey: ['client', activeBusinessId] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients', activeBusinessId] });
      void queryClient.invalidateQueries({ queryKey: ['client', activeBusinessId] });
    },
  });
}

export function useCreateSavedItem() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: (input: { description: string; unitPrice: number; currency: string }) =>
      createSavedItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(activeBusinessId) });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();

  return useMutation({
    mutationFn: (input: ProfileUpdate) => updateProfile(input),
    onSuccess: (profile: Profile) => {
      queryClient.setQueryData(queryKeys.profile(activeBusinessId), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(activeBusinessId) });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();

  return useMutation({
    mutationFn: (dataUrl: string) => uploadLogo(dataUrl),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(activeBusinessId) });
    },
  });
}

export function useRemoveLogo() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();

  return useMutation({
    mutationFn: () => removeLogo(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(activeBusinessId) });
    },
  });
}

export function useDuplicateDocument() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();

  return useMutation({
    mutationFn: (id: string) => duplicateDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', activeBusinessId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(activeBusinessId) });
    },
  });
}
