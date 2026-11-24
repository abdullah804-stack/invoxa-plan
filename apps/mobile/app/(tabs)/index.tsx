import { can, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { DocumentRow } from '../../src/components/DocumentRow';
import { Screen } from '../../src/components/Screen';
import { Skeleton, SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { useReminders, useRunRecurring, useSummary } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { errorMessage } from '../../src/lib/errors';
import { syncDueReminders } from '../../src/lib/reminders';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { CurrencySummary } from '../../src/api/types';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function CurrencyCard({ summary }: { summary: CurrencySummary }) {
  const { colors } = useTheme();

  const stats = [
    { label: 'Billed', value: summary.billed, tone: colors.text },
    { label: 'Paid', value: summary.paid, tone: colors.success },
    {
      label: 'Overdue',
      value: summary.overdue,
      tone: summary.overdue > 0 ? colors.danger : colors.textMuted,
    },
  ];

  return (
    <Card style={styles.currencyCard}>
      <Text style={[styles.cardCaption, { color: colors.textMuted }]}>
        Outstanding · {summary.currency}
      </Text>
      <Text style={[styles.outstanding, { color: colors.text }]}>
        {formatMoney(summary.outstanding, summary.currency)}
      </Text>
      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
            <Text style={[styles.statValue, { color: stat.tone }]} numberOfLines={1}>
              {formatMoney(stat.value, summary.currency)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, businesses, activeBusinessId, activeRole } = useSession();
  const summary = useSummary();
  const reminders = useReminders();
  const runRecurring = useRunRecurring();
  const ranRecurring = useRef(false);

  useEffect(() => {
    void syncDueReminders(reminders.data);
  }, [reminders.data]);

  useEffect(() => {
    if (ranRecurring.current || !activeRole || !can(activeRole, 'drafts:create')) return;
    ranRecurring.current = true;
    // Idempotent: called on app open, as docs/limits.md requires.
    runRecurring.mutate(undefined, { onError: () => undefined });
  }, [activeRole]);

  const businessName =
    businesses.find((business) => business.id === activeBusinessId)?.name ?? 'Your business';
  const firstName = user?.name.split(' ')[0] ?? 'there';
  const data = summary.data;
  const totalDocuments = data
    ? Object.values(data.counts).reduce((sum, count) => sum + count, 0)
    : 0;
  const hasDocuments = totalDocuments > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={summary.isRefetching}
            onRefresh={() => void summary.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>
              {greeting()}, {firstName}
            </Text>
            <Text style={[styles.businessName, { color: colors.text }]} numberOfLines={1}>
              {businessName}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>
              {businessName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        </View>

        {reminders.data && reminders.data.counts.overdue + reminders.data.counts.dueSoon > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open invoices that need a reminder"
            onPress={() => router.push('/invoices')}
          >
            <Card style={styles.reminderCard}>
              <View style={styles.reminderTop}>
                <Ionicons name="notifications-outline" size={18} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Needs a nudge</Text>
              </View>
              <Text style={[styles.reminderText, { color: colors.textMuted }]}>
                {reminders.data.counts.overdue} overdue · {reminders.data.counts.dueSoon} due soon
                {reminders.data.settings.enabled ? ' · reminders on this phone' : ''}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {summary.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={132} />
            <Skeleton height={22} width="45%" />
            <SkeletonRows rows={3} />
          </View>
        ) : summary.isError ? (
          <ErrorState
            message={errorMessage(summary.error)}
            onRetry={() => void summary.refetch()}
          />
        ) : !data || !hasDocuments ? (
          <EmptyState
            title="Nothing outstanding"
            message="When you issue an invoice, the amount owed appears here by currency."
            actionTitle="See invoices"
            onAction={() => router.push('/invoices')}
          />
        ) : (
          <>
            {data.currencies.length > 0 ? (
              <>
                <View style={styles.currencies}>
                  {data.currencies.map((currency) => (
                    <CurrencyCard key={currency.currency} summary={currency} />
                  ))}
                </View>
                <Text style={[styles.note, { color: colors.textMuted }]}>
                  Totals are per currency and are never added together.
                </Text>
              </>
            ) : (
              <Card>
                <Text style={[styles.note, { color: colors.textMuted }]}>
                  Drafts are not counted as outstanding. Issue an invoice to start tracking what you
                  are owed.
                </Text>
              </Card>
            )}

            {data.dueSoon.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Due soon</Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                    {data.counts.overdue} overdue
                  </Text>
                </View>
                <Card style={styles.listCard}>
                  {data.dueSoon.map((document, index) => (
                    <View
                      key={document.id}
                      style={[
                        index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                      ]}
                    >
                      <DocumentRow
                        document={document}
                        onPress={() => router.push(`/document/${document.id}`)}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent</Text>
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
              </View>
              {data.recent.length === 0 ? (
                <Card style={styles.listCard}>
                  <Text style={[styles.emptyLine, { color: colors.textMuted }]}>
                    No documents yet. Your first invoice shows up here.
                  </Text>
                </Card>
              ) : (
                <Card style={styles.listCard}>
                  {data.recent.map((document, index) => (
                    <View
                      key={document.id}
                      style={[
                        index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                      ]}
                    >
                      <DocumentRow
                        document={document}
                        onPress={() => router.push(`/document/${document.id}`)}
                      />
                    </View>
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
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    ...typeScale.small,
  },
  businessName: {
    ...typeScale.title,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typeScale.section,
  },
  loading: {
    gap: spacing.lg,
  },
  currencies: {
    gap: spacing.md,
  },
  currencyCard: {
    gap: spacing.xs,
  },
  cardCaption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  outstanding: {
    ...typeScale.money,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    ...typeScale.bodyStrong,
  },
  note: {
    ...typeScale.small,
  },
  reminderCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reminderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reminderText: {
    ...typeScale.small,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typeScale.section,
  },
  sectionCount: {
    ...typeScale.small,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  separator: {
    borderTopWidth: 1,
  },
  emptyLine: {
    ...typeScale.body,
    padding: spacing.lg,
  },
});
