import { can, formatDate, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBillProjectTime, useDeleteTimeEntry, useProject } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { formatMinutes } from '../../src/lib/time';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { TimeEntry } from '../../src/api/types';

const STATUS_LABELS = { active: 'Active', completed: 'Completed', archived: 'Archived' } as const;

function EntryRow({
  entry,
  canDelete,
  onDelete,
}: {
  entry: TimeEntry;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryText}>
        <Text style={[styles.entryDescription, { color: colors.text }]} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {formatDate(entry.date)} · {formatMinutes(entry.minutes)} ·{' '}
          {formatMoney(entry.hourlyRateMinor, entry.currency)}/hr
          {entry.billable ? '' : ' · not billable'}
          {entry.billedDocumentId ? ' · billed' : ''}
        </Text>
      </View>
      {canDelete && !entry.billedDocumentId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${entry.description}`}
          onPress={onDelete}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** One project: budget, tracked time, the draft made from it and its invoices. */
export default function ProjectDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const project = useProject(id);
  const bill = useBillProjectTime(id ?? '');
  const removeEntry = useDeleteTimeEntry(id ?? '');
  const { activeRole } = useSession();
  const [notice, setNotice] = useState<string | null>(null);

  const canWriteProjects = activeRole ? can(activeRole, 'clients:write') : false;
  const canWriteTime = activeRole ? can(activeRole, 'time:write') : false;

  const data = project.data;
  const detail = data?.project;

  const billTime = () => {
    Alert.alert(
      'Invoice unbilled time?',
      'A draft invoice is created with one line per description. You can edit it before issuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create draft',
          onPress: () => {
            bill.mutate(undefined, {
              onSuccess: (result) => router.push(`/document/${result.document.id}`),
              onError: (caught) => setNotice(errorMessage(caught)),
            });
          },
        },
      ],
    );
  };

  const confirmDeleteEntry = (entry: TimeEntry) => {
    Alert.alert('Delete this time?', `${formatMinutes(entry.minutes)} will be removed.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeEntry.mutate(entry.id),
      },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={project.isRefetching}
            onRefresh={() => void project.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {detail?.name ?? 'Project'}
          </Text>
          {detail && canWriteProjects ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit project"
              onPress={() => router.push(`/project/new?id=${detail.id}`)}
              hitSlop={12}
            >
              <Ionicons name="create-outline" size={22} color={colors.accent} />
            </Pressable>
          ) : (
            <View style={styles.topSpacer} />
          )}
        </View>

        {project.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={120} />
            <Skeleton height={180} />
          </View>
        ) : project.isError || !data || !detail ? (
          <ErrorState
            message={
              project.isError ? errorMessage(project.error) : 'That project could not be found.'
            }
            onRetry={() => void project.refetch()}
          />
        ) : (
          <>
            <Card style={styles.summary}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryText}>
                  <Text style={[styles.client, { color: colors.textMuted }]}>
                    {detail.clientName ?? 'No client'} · {STATUS_LABELS[detail.status]}
                  </Text>
                  <Text style={[styles.big, { color: colors.text }]}>
                    {formatMinutes(data.time.minutes)} tracked
                  </Text>
                </View>
                {detail.hourlyRateMinor !== null ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {formatMoney(detail.hourlyRateMinor, detail.currency)}/hr
                  </Text>
                ) : null}
              </View>

              <View style={[styles.stats, { borderTopColor: colors.border }]}>
                <View style={styles.stat}>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>Unbilled</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {formatMinutes(data.time.unbilledMinutes)}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>Unbilled value</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {formatMoney(data.time.unbilledValueMinor, detail.currency)}
                  </Text>
                </View>
              </View>

              {detail.budgetMinor !== null && detail.budgetMinor > 0 ? (
                <View style={styles.budget}>
                  <View style={[styles.budgetTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={[
                        styles.budgetFill,
                        {
                          backgroundColor: colors.accent,
                          width: `${Math.min(100, Math.round((data.time.valueMinor / detail.budgetMinor) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {formatMoney(data.time.valueMinor, detail.currency)} of{' '}
                    {formatMoney(detail.budgetMinor, detail.currency)} budget
                  </Text>
                </View>
              ) : null}
            </Card>

            {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}

            <View style={styles.actions}>
              {canWriteTime ? (
                <Button
                  title="Add time"
                  onPress={() => router.push(`/time/new?projectId=${detail.id}`)}
                />
              ) : null}
              {canWriteTime && data.time.unbilledMinutes > 0 ? (
                <Button
                  title="Invoice unbilled time"
                  variant="secondary"
                  onPress={billTime}
                  loading={bill.isPending}
                />
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Time</Text>
              {data.entries.length === 0 ? (
                <Card>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    No time tracked yet. Add it here and bill it when you are ready.
                  </Text>
                </Card>
              ) : (
                <Card style={styles.listCard}>
                  {data.entries.map((entry, index) => (
                    <View
                      key={entry.id}
                      style={[
                        index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                      ]}
                    >
                      <EntryRow
                        entry={entry}
                        canDelete={canWriteTime}
                        onDelete={() => confirmDeleteEntry(entry)}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Invoices</Text>
              {data.documents.length === 0 ? (
                <Card>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    No invoices on this project yet.
                  </Text>
                </Card>
              ) : (
                <Card style={styles.listCard}>
                  {data.documents.map((document, index) => (
                    <Pressable
                      key={document.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${document.number ?? 'draft invoice'}`}
                      onPress={() => router.push(`/document/${document.id}`)}
                      style={[
                        styles.entryRow,
                        index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                      ]}
                    >
                      <View style={styles.entryText}>
                        <Text style={[styles.entryDescription, { color: colors.text }]}>
                          {document.number ?? 'Draft invoice'}
                        </Text>
                        <Text style={[styles.meta, { color: colors.textMuted }]}>
                          {document.issueDate ? formatDate(document.issueDate) : 'Not issued'} ·{' '}
                          {document.status}
                        </Text>
                      </View>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatMoney(document.total, document.currency)}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  topSpacer: {
    width: 22,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  loading: {
    gap: spacing.md,
  },
  summary: {
    gap: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  client: {
    ...typeScale.small,
  },
  big: {
    ...typeScale.title,
  },
  meta: {
    ...typeScale.small,
  },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    ...typeScale.bodyStrong,
  },
  budget: {
    gap: spacing.xs,
  },
  budgetTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  budgetFill: {
    height: 6,
    borderRadius: radius.pill,
  },
  actions: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.section,
  },
  listCard: {
    padding: 0,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  entryText: {
    flex: 1,
    gap: 2,
  },
  entryDescription: {
    ...typeScale.bodyStrong,
  },
  error: {
    ...typeScale.small,
  },
});
