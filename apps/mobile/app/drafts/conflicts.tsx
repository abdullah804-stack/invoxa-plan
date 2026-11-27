import { computeTotals, DOCUMENT_TITLES, formatDate, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useOfflineDrafts, useResolveOfflineConflict } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import type { QueuedDraft } from '../../src/lib/offline';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/** The phone copy's total, from the same shared totals function the server uses. */
function phoneTotal(item: QueuedDraft): number | null {
  try {
    return computeTotals({
      items: item.payload.items.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountBp: line.discountBp ?? 0,
      })),
      discount: item.payload.discount ?? null,
      taxRateBp: item.payload.taxRateBp ?? 0,
      taxMode: item.payload.taxMode ?? 'added',
    }).total;
  } catch {
    return null;
  }
}

function shortDate(value: string | null): string {
  return value ? formatDate(value.slice(0, 10)) : 'unknown';
}

/**
 * Drafts the server refused because they changed elsewhere. Each one waits here
 * until the user decides: keep the phone copy (which wins, or becomes a new draft
 * when the server copy was already issued) or discard it.
 */
export default function DraftConflictsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const offline = useOfflineDrafts();
  const resolve = useResolveOfflineConflict();
  const [notice, setNotice] = useState<string | null>(null);

  const conflicts = (offline.data ?? []).filter((item) => item.conflict);

  const act = (item: QueuedDraft, action: 'keep' | 'discard') => {
    setNotice(null);
    resolve.mutate(
      { clientUuid: item.clientUuid, action },
      {
        onSuccess: () =>
          setNotice(
            action === 'keep'
              ? 'Phone copy saved. It has left the queue.'
              : 'Phone copy discarded.',
          ),
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  };

  const confirmDiscard = (item: QueuedDraft) => {
    Alert.alert(
      'Discard the phone copy?',
      'This draft was never synced. Once discarded it cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => act(item, 'discard') },
      ],
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/invoices'))}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Draft conflicts</Text>
          <View style={styles.spacer} />
        </View>

        <Text style={[styles.intro, { color: colors.textMuted }]}>
          These drafts were edited here and somewhere else at the same time. Nothing is lost: keep
          the copy on this phone or discard it.
        </Text>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.small, { color: colors.accent }]}>{notice}</Text>
          </View>
        ) : null}

        {offline.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </View>
        ) : offline.isError ? (
          <ErrorState
            message={errorMessage(offline.error)}
            onRetry={() => void offline.refetch()}
          />
        ) : conflicts.length === 0 ? (
          <EmptyState
            title="Nothing needs a decision"
            message="Every draft on this phone has synced or is waiting for a connection."
            actionTitle="Back to invoices"
            onAction={() => router.replace('/invoices')}
          />
        ) : (
          conflicts.map((item) => {
            const total = phoneTotal(item);
            const conflict = item.conflict;
            const wasIssued = Boolean(conflict?.serverStatus && conflict.serverStatus !== 'draft');
            const keeping =
              resolve.isPending &&
              resolve.variables?.clientUuid === item.clientUuid &&
              resolve.variables.action === 'keep';
            const discarding =
              resolve.isPending &&
              resolve.variables?.clientUuid === item.clientUuid &&
              resolve.variables.action === 'discard';

            return (
              <Card key={item.clientUuid} style={styles.card}>
                <Text style={[styles.caption, { color: colors.textMuted }]}>
                  {DOCUMENT_TITLES[item.docType]}
                </Text>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {total === null ? 'Draft' : formatMoney(total, item.payload.currency)}
                </Text>
                <Text style={[styles.small, { color: colors.textMuted }]}>
                  On this phone · saved {shortDate(item.queuedAt)} · {item.payload.items.length}{' '}
                  line{item.payload.items.length === 1 ? '' : 's'}
                </Text>

                <Text style={[styles.body, { color: colors.danger }]}>{conflict?.message}</Text>

                {conflict?.serverStatus ? (
                  <View style={[styles.serverBox, { borderColor: colors.border }]}>
                    <Text style={[styles.caption, { color: colors.textMuted }]}>On the server</Text>
                    <Text style={[styles.bodyStrong, { color: colors.text }]}>
                      {wasIssued
                        ? `${conflict.serverNumber ?? 'Issued document'} · ${conflict.serverStatus}`
                        : 'Draft'}
                      {conflict.serverTotal !== null
                        ? ` · ${formatMoney(conflict.serverTotal, item.payload.currency)}`
                        : ''}
                    </Text>
                    <Text style={[styles.tiny, { color: colors.textMuted }]}>
                      Changed {shortDate(conflict.serverUpdatedAt)}
                    </Text>
                    {conflict.serverDocumentId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open the server copy"
                        onPress={() => router.push(`/document/${conflict.serverDocumentId}`)}
                        style={styles.link}
                        hitSlop={8}
                      >
                        <Text style={[styles.small, { color: colors.accent }]}>
                          View server copy
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <Button
                  title={wasIssued ? 'Keep phone copy as a new draft' : 'Keep phone copy'}
                  onPress={() => act(item, 'keep')}
                  loading={keeping}
                  disabled={discarding}
                  accessibilityHint={
                    wasIssued
                      ? 'The server copy is already issued, so this saves the phone copy as a new draft'
                      : 'Overwrites the server draft with the copy on this phone'
                  }
                />
                <Button
                  title="Discard phone copy"
                  variant="danger"
                  onPress={() => confirmDiscard(item)}
                  loading={discarding}
                  disabled={keeping}
                />
              </Card>
            );
          })
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
    gap: spacing.md,
  },
  title: {
    ...typeScale.section,
    flex: 1,
  },
  spacer: {
    width: 24,
  },
  intro: {
    ...typeScale.body,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  small: {
    ...typeScale.small,
  },
  tiny: {
    ...typeScale.tiny,
  },
  loading: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  caption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  amount: {
    ...typeScale.display,
  },
  body: {
    ...typeScale.body,
  },
  bodyStrong: {
    ...typeScale.bodyStrong,
  },
  serverBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
});
