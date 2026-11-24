import { formatDate, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useDeleteRecurring,
  useRecurringSchedules,
  useRunRecurring,
  useUpdateRecurring,
} from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { RecurringSchedule } from '../../src/api/types';

function intervalLabel(schedule: RecurringSchedule): string {
  const unit =
    schedule.interval === 'weekly' ? 'week' : schedule.interval === 'yearly' ? 'year' : 'month';
  return schedule.intervalCount === 1
    ? `Every ${unit}`
    : `Every ${schedule.intervalCount} ${unit}s`;
}

function ScheduleCard({ schedule }: { schedule: RecurringSchedule }) {
  const { colors } = useTheme();
  const router = useRouter();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();

  const total = schedule.items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0,
  );

  const confirmDelete = () => {
    Alert.alert(
      'Stop repeating?',
      'Drafts already created stay. This schedule stops making new ones.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => remove.mutate(schedule.id),
        },
      ],
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardText}>
          <Text style={[styles.client, { color: colors.text }]} numberOfLines={1}>
            {schedule.clientName ?? 'No client'}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {intervalLabel(schedule)} · {formatMoney(total, schedule.currency)} ·{' '}
            {schedule.items.length} {schedule.items.length === 1 ? 'line' : 'lines'}
          </Text>
        </View>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: schedule.active ? colors.accentSoft : colors.surfaceMuted,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: schedule.active ? colors.accent : colors.textMuted },
            ]}
          >
            {schedule.active ? 'Active' : 'Paused'}
          </Text>
        </View>
      </View>

      <View style={[styles.cardMeta, { borderTopColor: colors.border }]}>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {schedule.active ? 'Next draft' : 'Was due'} {formatDate(schedule.nextRunAt)}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>Net {schedule.dueDays} days</Text>
      </View>

      {schedule.lastError ? (
        <Text style={[styles.meta, { color: colors.danger }]}>{schedule.lastError}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={schedule.active ? 'Pause schedule' : 'Resume schedule'}
          onPress={() => update.mutate({ id: schedule.id, active: !schedule.active })}
          style={styles.linkButton}
        >
          <Text style={[styles.link, { color: colors.accent }]}>
            {schedule.active ? 'Pause' : 'Resume'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the original invoice"
          onPress={() => router.push(`/document/${schedule.documentId}`)}
          style={styles.linkButton}
        >
          <Text style={[styles.link, { color: colors.accent }]}>Invoice</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop repeating"
          onPress={confirmDelete}
          style={styles.linkButton}
        >
          <Text style={[styles.link, { color: colors.danger }]}>Stop</Text>
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * Recurring invoices list. Schedules are created from an invoice, so this screen
 * only manages them; the run is idempotent and also happens on app open.
 */
export default function RecurringScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const schedules = useRecurringSchedules();
  const run = useRunRecurring();
  const [notice, setNotice] = useState<string | null>(null);

  const checkNow = async () => {
    setNotice(null);
    try {
      const result = await run.mutateAsync();
      setNotice(
        result.created === 0
          ? 'Nothing is due yet. New drafts appear on their own date.'
          : `Created ${result.created} draft${result.created === 1 ? '' : 's'} in Invoices.`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const list = schedules.data?.schedules ?? [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={schedules.isRefetching}
            onRefresh={() => void schedules.refetch()}
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
          <Text style={[styles.title, { color: colors.text }]}>Recurring</Text>
          <View style={styles.topSpacer} />
        </View>

        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Repeat an invoice on a schedule. Each occurrence is a draft you can check before sending.
        </Text>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.noticeText, { color: colors.accent }]}>{notice}</Text>
          </View>
        ) : null}

        {schedules.isLoading ? (
          <SkeletonRows rows={3} />
        ) : schedules.isError ? (
          <ErrorState
            message={errorMessage(schedules.error)}
            onRetry={() => void schedules.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title="No repeating invoices"
            message="Open an invoice and choose Repeat to make it monthly, weekly or yearly."
            actionTitle="Open invoices"
            onAction={() => router.push('/invoices')}
          />
        ) : (
          <>
            {list.map((schedule) => (
              <ScheduleCard key={schedule.id} schedule={schedule} />
            ))}
            <Button
              title="Check for due drafts"
              variant="secondary"
              onPress={() => void checkNow()}
              loading={run.isPending}
            />
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
    width: 24,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  intro: {
    ...typeScale.body,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typeScale.small,
  },
  card: {
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  client: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typeScale.small,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  linkButton: {
    paddingVertical: 2,
  },
  link: {
    ...typeScale.small,
  },
});
