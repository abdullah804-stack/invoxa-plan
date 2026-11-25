import { formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  exportFunctions,
  useAging,
  useCashFlow,
  useSalesByClient,
  useSummary,
  useTaxSummary,
} from '../../src/api/hooks';
import type { ReportRange } from '../../src/api/types';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { shareCsv } from '../../src/lib/csvFile';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

type Preset = 'month' | 'quarter' | 'year';

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** This month, this quarter or this year, always ending today. */
function rangeFor(preset: Preset): ReportRange {
  const now = new Date();
  const from =
    preset === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : preset === 'quarter'
        ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
        : new Date(now.getFullYear(), 0, 1);
  return { from: isoDate(from), to: isoDate(now) };
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('month');
  const range = useMemo(() => rangeFor(preset), [preset]);

  const cashFlow = useCashFlow(range);
  const aging = useAging();
  const sales = useSalesByClient(range);
  const tax = useTaxSummary(range);
  const summary = useSummary();

  const [exporting, setExporting] = useState<'documents' | 'expenses' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const exportCsv = async (kind: 'documents' | 'expenses') => {
    setNotice(null);
    setExporting(kind);
    try {
      const text =
        kind === 'documents'
          ? await exportFunctions.fetchDocumentsCsv({ from: range.from, to: range.to })
          : await exportFunctions.fetchExpensesCsv({ from: range.from, to: range.to });
      await shareCsv(text, kind === 'documents' ? 'invoxa-documents.csv' : 'invoxa-expenses.csv');
      setNotice('CSV ready. It opens in Excel and Google Sheets.');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  const loading = cashFlow.isLoading || aging.isLoading || sales.isLoading || tax.isLoading;
  const failed = cashFlow.isError || aging.isError || sales.isError || tax.isError;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Reports</Text>
          <View style={styles.spacer} />
        </View>

        <View style={styles.presets}>
          {(['month', 'quarter', 'year'] as const).map((option) => (
            <FilterChip
              key={option}
              label={
                option === 'month' ? 'This month' : option === 'quarter' ? 'This quarter' : 'This year'
              }
              selected={preset === option}
              onPress={() => setPreset(option)}
            />
          ))}
        </View>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.small, { color: colors.accent }]}>{notice}</Text>
          </View>
        ) : null}

        {failed ? (
          <ErrorState
            message={errorMessage(cashFlow.error ?? aging.error ?? sales.error ?? tax.error)}
            onRetry={() => {
              void cashFlow.refetch();
              void aging.refetch();
              void sales.refetch();
              void tax.refetch();
            }}
          />
        ) : null}

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Cash flow</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Invoiced and collected in this period, and what is still owed today.
          </Text>
          {loading ? (
            <Skeleton height={90} />
          ) : (cashFlow.data?.currencies.length ?? 0) === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              No invoices in this period yet.
            </Text>
          ) : (
            cashFlow.data?.currencies.map((section) => {
              const peak = Math.max(
                1,
                ...section.months.map((month) => Math.max(month.invoiced, month.collected)),
              );
              return (
                <View key={section.currency} style={styles.block}>
                  <Text style={[styles.currency, { color: colors.text }]}>{section.currency}</Text>
                  <View style={styles.statGrid}>
                    {[
                      { label: 'Invoiced', value: section.invoiced },
                      { label: 'Collected', value: section.collected },
                      { label: 'Overdue', value: section.overdue },
                      { label: 'Due this month', value: section.expectedThisMonth },
                    ].map((stat) => (
                      <View key={stat.label} style={styles.stat}>
                        <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                          {stat.label}
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                          {formatMoney(stat.value, section.currency)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.caption, { color: colors.textMuted }]}>
                    Average days to pay{' '}
                    {section.averageDaysToPay === null ? '—' : `${section.averageDaysToPay}`}
                  </Text>

                  {section.months.map((month) => (
                    <View key={month.month} style={styles.monthRow}>
                      <Text style={[styles.monthLabel, { color: colors.textMuted }]}>
                        {month.month}
                      </Text>
                      <View style={styles.bars}>
                        <View
                          style={[
                            styles.bar,
                            {
                              backgroundColor: colors.accent,
                              width: `${Math.round((month.invoiced / peak) * 100)}%`,
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.bar,
                            styles.barCollected,
                            {
                              backgroundColor: colors.success,
                              width: `${Math.round((month.collected / peak) * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                  <View style={styles.legend}>
                    <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.tiny, { color: colors.textMuted }]}>Invoiced</Text>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.tiny, { color: colors.textMuted }]}>Collected</Text>
                  </View>

                  {section.slowestPayers.length > 0 ? (
                    <View style={styles.slow}>
                      <Text style={[styles.caption, { color: colors.textMuted }]}>
                        Slowest payers
                      </Text>
                      {section.slowestPayers.map((payer) => (
                        <View key={`${payer.clientId}-${payer.currency}`} style={styles.rowBetween}>
                          <Text style={[styles.body, { color: colors.text }]} numberOfLines={1}>
                            {payer.clientName}
                          </Text>
                          <Text style={[styles.tiny, { color: colors.textMuted }]}>
                            {payer.averageDays} days · {payer.settled} paid
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Aging</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Unpaid invoices by how late they are, as of today.
          </Text>
          {aging.isLoading ? (
            <Skeleton height={70} />
          ) : (aging.data?.currencies.length ?? 0) === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>Nothing is outstanding.</Text>
          ) : (
            aging.data?.currencies.map((section) => (
              <View key={section.currency} style={styles.block}>
                <Text style={[styles.currency, { color: colors.text }]}>
                  {section.currency} · {formatMoney(section.total, section.currency)} unpaid
                </Text>
                {section.buckets.map((bucket) => (
                  <View key={bucket.key} style={styles.rowBetween}>
                    <Text style={[styles.body, { color: colors.textMuted }]}>{bucket.label}</Text>
                    <Text style={[styles.bodyStrong, { color: colors.text }]}>
                      {formatMoney(bucket.amount, section.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Sales by client</Text>
          {sales.isLoading ? (
            <Skeleton height={70} />
          ) : (sales.data?.rows.length ?? 0) === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              No invoices in this period.
            </Text>
          ) : (
            sales.data?.rows.map((row) => (
              <View key={`${row.clientId}-${row.currency}`} style={styles.rowBetween}>
                <View style={styles.grow}>
                  <Text style={[styles.body, { color: colors.text }]} numberOfLines={1}>
                    {row.clientName}
                  </Text>
                  <Text style={[styles.tiny, { color: colors.textMuted }]}>
                    {row.invoices} invoice{row.invoices === 1 ? '' : 's'} · {row.currency}
                  </Text>
                </View>
                <View style={styles.alignEnd}>
                  <Text style={[styles.bodyStrong, { color: colors.text }]}>
                    {formatMoney(row.invoiced, row.currency)}
                  </Text>
                  <Text style={[styles.tiny, { color: colors.textMuted }]}>
                    {formatMoney(row.outstanding, row.currency)} open
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tax</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Tax on issued invoices, by month and by quarter. Check your local rate before filing.
          </Text>
          {tax.isLoading ? (
            <Skeleton height={60} />
          ) : (tax.data?.months.length ?? 0) === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              No tax was charged in this period.
            </Text>
          ) : (
            <>
              {[
                { title: 'By month', rows: tax.data?.months ?? [] },
                { title: 'By quarter', rows: tax.data?.quarters ?? [] },
              ].map((group) => (
                <View key={group.title} style={styles.block}>
                  <Text style={[styles.caption, { color: colors.textMuted }]}>{group.title}</Text>
                  {group.rows.map((row) => (
                    <View key={`${row.period}-${row.currency}`} style={styles.rowBetween}>
                      <Text style={[styles.body, { color: colors.textMuted }]}>
                        {row.period} · {row.currency}
                      </Text>
                      <Text style={[styles.bodyStrong, { color: colors.text }]}>
                        {formatMoney(row.tax, row.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Export</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            A CSV opens in Excel and Google Sheets. The period above applies.
          </Text>
          <Button
            title="Export invoices CSV"
            variant="secondary"
            onPress={() => void exportCsv('documents')}
            loading={exporting === 'documents'}
            disabled={exporting !== null}
          />
          <Button
            title="Export expenses CSV"
            variant="secondary"
            onPress={() => void exportCsv('expenses')}
            loading={exporting === 'expenses'}
            disabled={exporting !== null}
          />
        </Card>

        {(summary.data?.currencies.length ?? 0) === 0 ? (
          <EmptyState
            title="No numbers yet"
            message="Issue an invoice and this screen fills in."
            actionTitle="Create an invoice"
            onAction={() => router.push('/document/new')}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
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
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  block: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.section,
  },
  currency: {
    ...typeScale.bodyStrong,
  },
  caption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    flexBasis: '45%',
    flexGrow: 1,
    gap: 2,
  },
  statLabel: {
    ...typeScale.tiny,
  },
  statValue: {
    ...typeScale.bodyStrong,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthLabel: {
    ...typeScale.tiny,
    width: 58,
  },
  bars: {
    flex: 1,
    gap: 3,
  },
  bar: {
    height: 6,
    borderRadius: radius.pill,
  },
  barCollected: {
    opacity: 0.7,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  slow: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  grow: {
    flex: 1,
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  body: {
    ...typeScale.body,
  },
  bodyStrong: {
    ...typeScale.bodyStrong,
  },
  muted: {
    ...typeScale.body,
  },
  small: {
    ...typeScale.small,
  },
  tiny: {
    ...typeScale.tiny,
  },
});
