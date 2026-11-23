import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider';
import {
  duplicateDocument,
  fetchProfile,
  fetchSummary,
  listDocuments,
  removeLogo,
  updateProfile,
  uploadLogo,
  type ProfileUpdate,
} from './endpoints';
import type { DocumentListParams, Profile } from './types';

/**
 * Query keys include the active business, so switching business can never show
 * another business's cached numbers.
 */
export const queryKeys = {
  profile: (businessId: string | null) => ['profile', businessId] as const,
  summary: (businessId: string | null) => ['summary', businessId] as const,
  documents: (businessId: string | null, params: DocumentListParams) =>
    ['documents', businessId, params] as const,
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
