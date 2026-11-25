import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DocumentRow } from '../../src/components/DocumentRow';
import { FilterChip } from '../../src/components/FilterChip';
import { Segmented } from '../../src/components/Segmented';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { SwipeRow } from '../../src/components/SwipeRow';
import { TextField } from '../../src/components/TextField';
import {
  useDocumentPages,
  useDuplicateDocument,
  useOfflineDrafts,
  useSyncOfflineDrafts,
} from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { DocumentListParams, DocumentRecord } from '../../src/api/types';

type DocType = 'invoice' | 'estimate' | 'credit_note';
type StatusFilter = 'all' | 'draft' | 'sent' | 'partial' | 'overdue' | 'paid' | 'void';
type SortKey = 'newest' | 'oldest' | 'dueDate' | 'amount';

const TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoices' },
  { value: 'estimate', label: 'Estimates' },
  { value: 'credit_note', label: 'Credit notes' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Part paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  dueDate: 'Due date',
  amount: 'Largest',
};

const SORT_ORDER: SortKey[] = ['newest', 'oldest', 'dueDate', 'amount'];

export default function InvoicesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const duplicate = useDuplicateDocument();
  const offline = useOfflineDrafts();
  const syncOffline = useSyncOfflineDrafts();

  const [docType, setDocType] = useState<DocType>('invoice');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const params = useMemo<Omit<DocumentListParams, 'cursor'>>(
    () => ({
      docType,
      sort,
      limit: 25,
      ...(status !== 'all' ? { status } : {}),
      ...(query ? { q: query } : {}),
    }),
    [docType, sort, status, query],
  );

  const pages = useDocumentPages(params);
  const documents = useMemo(
    () => pages.data?.pages.flatMap((page) => page.documents) ?? [],
    [pages.data],
  );

  const canDuplicate = activeRole ? can(activeRole, 'documents:duplicate') : false;
  const canCreate = activeRole ? can(activeRole, 'drafts:create') : false;
  const canUseAi = activeRole ? can(activeRole, 'ai:use') : false;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  const onDuplicate = useCallback(
    (id: string) => {
      duplicate.mutate(id, {
        onSuccess: () => showNotice('Draft copied. Find it under Draft.'),
        onError: (error) => showNotice(errorMessage(error)),
      });
    },
    [duplicate, showNotice],
  );

  /** A stable row renderer keeps scrolling smooth: rows are memoised and only
   * re-render when their own document changes, not on every keystroke. */
  const renderItem = useCallback(
    ({ item }: { item: DocumentRecord }) => (
      <SwipeRow
        actionLabel="Duplicate"
        onAction={() => onDuplicate(item.id)}
        disabled={!canDuplicate}
      >
        <DocumentRow document={item} onPress={() => router.push(`/document/${item.id}`)} />
      </SwipeRow>
    ),
    [canDuplicate, onDuplicate, router],
  );

  const cycleSort = () => {
    const index = SORT_ORDER.indexOf(sort);
    const next = SORT_ORDER[(index + 1) % SORT_ORDER.length];
    if (next) setSort(next);
  };

  const nextPage = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };

  const filtered = status !== 'all' || query.length > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Invoices</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${SORT_LABELS[sort]}, tap to change`}
              onPress={cycleSort}
              style={[styles.sortButton, { borderColor: colors.border }]}
            >
              <Ionicons name="swap-vertical" size={15} color={colors.textMuted} />
              <Text style={[styles.sortLabel, { color: colors.textMuted }]}>
                {SORT_LABELS[sort]}
              </Text>
            </Pressable>
            {canUseAi ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Draft with AI"
                onPress={() => router.push('/document/ai')}
                style={[styles.aiButton, { borderColor: colors.accent }]}
              >
                <Ionicons name="sparkles-outline" size={17} color={colors.accent} />
              </Pressable>
            ) : null}
            {canCreate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New document"
                onPress={() => router.push('/document/new')}
                style={[styles.newButton, { backgroundColor: colors.accent }]}
              >
                <Ionicons name="add" size={18} color={colors.onAccent} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {(offline.data?.length ?? 0) > 0 ? (
          <View
            style={[
              styles.offlineBanner,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
          >
            <View style={styles.offlineText}>
              <Text style={[styles.offlineTitle, { color: colors.text }]}>
                {offline.data?.length} draft{(offline.data?.length ?? 0) === 1 ? '' : 's'} saved on
                this phone
              </Text>
              <Text style={[styles.offlineNote, { color: colors.textMuted }]}>
                They sync when you are back online. Nothing is lost.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync offline drafts"
              disabled={syncOffline.isPending}
              onPress={() =>
                syncOffline.mutate(undefined, {
                  onSuccess: (result) =>
                    showNotice(
                      result.remaining === 0
                        ? `${result.synced} of ${result.sent} synced.`
                        : `${result.synced} synced, ${result.conflicts} need attention.`,
                    ),
                  onError: (error) => showNotice(errorMessage(error)),
                })
              }
            >
              {syncOffline.isPending ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.offlineAction, { color: colors.accent }]}>Sync now</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search number, client or reference"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        <Segmented
          options={TYPE_OPTIONS}
          value={docType}
          onChange={setDocType}
          accessibilityLabel="Document type"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={status === option.value}
              onPress={() => setStatus(option.value)}
            />
          ))}
        </ScrollView>
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.noticeText, { color: colors.accent }]}>{notice}</Text>
        </View>
      ) : null}

      {pages.isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonRows rows={6} />
        </View>
      ) : pages.isError ? (
        <View style={styles.listPadding}>
          <ErrorState message={errorMessage(pages.error)} onRetry={() => void pages.refetch()} />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(document) => document.id}
          contentContainerStyle={[
            styles.listContent,
            documents.length === 0 ? styles.listEmpty : null,
          ]}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          refreshControl={
            <RefreshControl
              refreshing={pages.isRefetching && !pages.isFetchingNextPage}
              onRefresh={() => void pages.refetch()}
              tintColor={colors.textMuted}
            />
          }
          onEndReached={nextPage}
          onEndReachedThreshold={0.4}
          initialNumToRender={12}
          maxToRenderPerBatch={16}
          windowSize={9}
          ListEmptyComponent={
            <EmptyState
              title={
                filtered
                  ? 'No matches'
                  : `No ${docType === 'credit_note' ? 'credit notes' : `${docType}s`} yet`
              }
              message={
                filtered
                  ? 'Try a different status, type or search term.'
                  : 'Documents appear here as soon as they are created on this phone.'
              }
              {...(filtered
                ? {
                    actionTitle: 'Clear filters',
                    onAction: () => {
                      setStatus('all');
                      setSearch('');
                    },
                  }
                : {})}
            />
          }
          ListFooterComponent={
            pages.isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.textMuted} />
              </View>
            ) : undefined
          }
          renderItem={renderItem}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typeScale.display,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineText: {
    flex: 1,
    gap: 2,
  },
  offlineTitle: {
    ...typeScale.bodyStrong,
  },
  offlineNote: {
    ...typeScale.small,
  },
  offlineAction: {
    ...typeScale.bodyStrong,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  sortLabel: {
    ...typeScale.small,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  notice: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typeScale.small,
  },
  listPadding: {
    paddingHorizontal: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  gap: {
    height: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
});
