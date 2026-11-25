import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider';
import {
  acceptInvite,
  applyLateFee,
  billProjectTime,
  createBusiness,
  createClient,
  createDocument,
  createInvite,
  createExpense,
  createProject,
  createRecurring,
  createSavedItem,
  createTimeEntry,
  deleteClient,
  deleteDocument,
  deleteExpense,
  deleteProject,
  deleteRecurring,
  deleteTimeEntry,
  discardTimer,
  draftWithAi,
  fetchTeam,
  duplicateDocument,
  fetchExpenseReport,
  fetchReminders,
  fetchBrandAsset,
  fetchClient,
  fetchDocument,
  fetchExpense,
  fetchProfile,
  fetchProject,
  fetchSummary,
  fetchTimer,
  issueDocument,
  leaveBusiness,
  listActivity,
  listClients,
  listDocuments,
  listExpenses,
  listProjects,
  listRecurring,
  listSavedItems,
  listTimeEntries,
  recordPayment,
  removeLogo,
  removeMember,
  revokeInvite,
  runRecurring,
  scanReceipt,
  setDocumentStatus,
  startTimer,
  stopTimer,
  transferOwnership,
  updateClient,
  updateDocument,
  updateExpense,
  updateMemberRole,
  updateProfile,
  updateProject,
  updateRecurring,
  uploadLogo,
  type ClientInput,
  type ProfileUpdate,
} from './endpoints';
import type {
  ClientListParams,
  DocumentDraftBody,
  DocumentListParams,
  DocumentRecord,
  ExpenseCategory,
  ExpenseInput,
  PaymentInput,
  Profile,
  ProjectInput,
  ProjectStatus,
  ReceiptScanResult,
  RecurringSchedule,
  TimeEntryInput,
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
  reminders: (businessId: string | null) => ['reminders', businessId] as const,
  recurring: (businessId: string | null) => ['recurring', businessId] as const,
  expenses: (
    businessId: string | null,
    params: { category?: ExpenseCategory; unbilled?: 'true' | 'false' },
  ) => ['expenses', businessId, params] as const,
  expenseReport: (businessId: string | null, params: { from?: string; to?: string }) =>
    ['expense-report', businessId, params] as const,
  timer: (businessId: string | null) => ['timer', businessId] as const,
  expense: (businessId: string | null, id: string) => ['expense', businessId, id] as const,
  projects: (businessId: string | null, params: { status?: ProjectStatus; clientId?: string }) =>
    ['projects', businessId, params] as const,
  project: (businessId: string | null, id: string) => ['project', businessId, id] as const,
  timeEntries: (businessId: string | null, projectId: string) =>
    ['time-entries', businessId, projectId] as const,
  team: (businessId: string | null) => ['team', businessId] as const,
  activity: (businessId: string | null) => ['activity', businessId] as const,
};

export function useTeam() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.team(activeBusinessId),
    queryFn: fetchTeam,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

function useTeamInvalidation() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.team(activeBusinessId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activity(activeBusinessId) });
  };
}

export function useCreateInvite() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: (role: 'staff' | 'viewer') => createInvite(role),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite() {
  const invalidate = useTeamInvalidation();
  return useMutation({ mutationFn: (id: string) => revokeInvite(id), onSuccess: invalidate });
}

export function useAcceptInvite() {
  return useMutation({ mutationFn: (code: string) => acceptInvite(code) });
}

export function useCreateBusiness() {
  return useMutation({
    mutationFn: (input: { name: string; currency?: string; language?: string }) =>
      createBusiness(input),
  });
}

export function useUpdateMemberRole() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'staff' | 'viewer' }) =>
      updateMemberRole(id, role),
    onSuccess: invalidate,
  });
}

export function useRemoveMember() {
  const invalidate = useTeamInvalidation();
  return useMutation({ mutationFn: (id: string) => removeMember(id), onSuccess: invalidate });
}

export function useLeaveBusiness() {
  return useMutation({ mutationFn: leaveBusiness });
}

export function useTransferOwnership() {
  const invalidate = useTeamInvalidation();
  return useMutation({
    mutationFn: (membershipId: string) => transferOwnership(membershipId),
    onSuccess: invalidate,
  });
}

/** The log pages backwards; a new entry cannot shift an existing row. */
export function useActivityPages(enabled: boolean) {
  const { activeBusinessId } = useSession();
  return useInfiniteQuery({
    queryKey: queryKeys.activity(activeBusinessId),
    queryFn: ({ pageParam }) => listActivity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

export function useProfile() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.profile(activeBusinessId),
    queryFn: fetchProfile,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    staleTime: 30_000,
  });
}

export function useProjects(params: { status?: ProjectStatus; clientId?: string } = {}) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.projects(activeBusinessId, params),
    queryFn: () => listProjects(params),
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

export function useProject(id: string | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.project(activeBusinessId, id ?? ''),
    queryFn: () => fetchProject(id as string),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(id),
  });
}

function useProjectInvalidation(id?: string) {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['projects', activeBusinessId] });
    if (id)
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(activeBusinessId, id) });
    void queryClient.invalidateQueries({ queryKey: ['time-entries', activeBusinessId] });
  };
}

export function useCreateProject() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: (input: ProjectInput) => createProject(input),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useProjectInvalidation(id);
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) => updateProject(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useProjectInvalidation();
  return useMutation({ mutationFn: (id: string) => deleteProject(id), onSuccess: invalidate });
}

export function useTimeEntries(projectId: string | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.timeEntries(activeBusinessId, projectId ?? ''),
    queryFn: () => listTimeEntries({ projectId: projectId as string, limit: 200 }),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(projectId),
  });
}

export function useCreateTimeEntry(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);
  return useMutation({
    mutationFn: (input: TimeEntryInput) => createTimeEntry(input),
    onSuccess: invalidate,
  });
}

export function useDeleteTimeEntry(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);
  return useMutation({ mutationFn: (id: string) => deleteTimeEntry(id), onSuccess: invalidate });
}

export function useBillProjectTime(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: () => billProjectTime(projectId),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['documents', activeBusinessId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(activeBusinessId) });
    },
  });
}

export function useExpenses(
  params: { category?: ExpenseCategory; unbilled?: 'true' | 'false' } = {},
) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.expenses(activeBusinessId, params),
    queryFn: () => listExpenses(params),
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

export function useExpense(id: string | undefined) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.expense(activeBusinessId, id ?? ''),
    queryFn: () => fetchExpense(id as string),
    enabled: status === 'signedIn' && Boolean(activeBusinessId) && Boolean(id),
  });
}

function useExpenseInvalidation(id?: string) {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses', activeBusinessId] });
    if (id)
      void queryClient.invalidateQueries({ queryKey: queryKeys.expense(activeBusinessId, id) });
  };
}

export function useCreateExpense() {
  const invalidate = useExpenseInvalidation();
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(input),
    onSuccess: invalidate,
  });
}

export function useUpdateExpense(id: string) {
  const invalidate = useExpenseInvalidation(id);
  return useMutation({
    mutationFn: (input: Partial<ExpenseInput>) => updateExpense(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useExpenseInvalidation();
  return useMutation({ mutationFn: (id: string) => deleteExpense(id), onSuccess: invalidate });
}

export function useExpenseReport(params: { from?: string; to?: string } = {}) {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.expenseReport(activeBusinessId, params),
    queryFn: () => fetchExpenseReport(params),
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

export function useTimer() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.timer(activeBusinessId),
    queryFn: fetchTimer,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    refetchInterval: 60_000,
  });
}

function useTimerInvalidation() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.timer(activeBusinessId) });
    void queryClient.invalidateQueries({ queryKey: ['time-entries', activeBusinessId] });
    void queryClient.invalidateQueries({ queryKey: ['projects', activeBusinessId] });
  };
}

export function useStartTimer() {
  const invalidate = useTimerInvalidation();
  return useMutation({
    mutationFn: (input: { projectId: string; description?: string }) => startTimer(input),
    onSuccess: invalidate,
  });
}

export function useStopTimer() {
  const invalidate = useTimerInvalidation();
  return useMutation({ mutationFn: () => stopTimer(), onSuccess: invalidate });
}

export function useDiscardTimer() {
  const invalidate = useTimerInvalidation();
  return useMutation({ mutationFn: () => discardTimer(), onSuccess: invalidate });
}

export function useScanReceipt() {
  return useMutation({
    mutationFn: (image: string): Promise<{ receipt: ReceiptScanResult; remaining: number }> =>
      scanReceipt(image),
  });
}

export function useApplyLateFee() {
  const onDocumentChange = useDocumentCacheUpdates();
  return useMutation({
    mutationFn: (id: string) => applyLateFee(id),
    onSuccess: (result) => onDocumentChange(result.document),
  });
}

export function useReminders() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.reminders(activeBusinessId),
    queryFn: fetchReminders,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
    staleTime: 60_000,
  });
}

export function useRecurringSchedules() {
  const { status, activeBusinessId } = useSession();
  return useQuery({
    queryKey: queryKeys.recurring(activeBusinessId),
    queryFn: listRecurring,
    enabled: status === 'signedIn' && Boolean(activeBusinessId),
  });
}

function useRecurringInvalidation() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.recurring(activeBusinessId) });
    void queryClient.invalidateQueries({ queryKey: ['documents', activeBusinessId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.summary(activeBusinessId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.reminders(activeBusinessId) });
  };
}

export function useCreateRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (input: {
      documentId: string;
      interval: 'weekly' | 'monthly' | 'yearly';
      intervalCount?: number;
      startDate?: string;
      dueDays?: number;
      endDate?: string;
    }) => createRecurring(input),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      interval?: 'weekly' | 'monthly' | 'yearly';
      intervalCount?: number;
      dueDays?: number;
      endDate?: string | null;
      active?: boolean;
    }) => updateRecurring(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  const invalidate = useRecurringInvalidation();
  const queryClient = useQueryClient();
  const { activeBusinessId } = useSession();
  return useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<{ schedules: RecurringSchedule[] } | undefined>(
        queryKeys.recurring(activeBusinessId),
        (current) => current && { schedules: current.schedules.filter((s) => s.id !== id) },
      );
      invalidate();
    },
  });
}

export function useRunRecurring() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: runRecurring,
    onSuccess: invalidate,
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
