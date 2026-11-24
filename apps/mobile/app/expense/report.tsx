import { EXPENSE_CATEGORY_LABELS, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExpenseReport } from '../../src/api/hooks';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * What the business spent, by category and currency. Total are never added
 * across currencies, so each one is its own row.
 */
export default function ExpenseReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const report = useExpenseReport({ from, to });

  const data = report.data;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Expense report</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.dateRow}>
          <TextField
            label="From"
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
          <TextField
            label="To"
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
        </View>

        {data ? (
          <Card style={styles.totalCard}>
            <Text style={[styles.caption, { color: colors.textMuted }]}>Total spent</Text>
            {data.totals.length === 0 ? (
              <Text style={[styles.total, { color: colors.text }]}>Nothing in this range</Text>
            ) : (
              data.totals.map((total) => (
                <Text key={total.currency} style={[styles.total, { color: colors.text }]}>
                  {formatMoney(total.amount, total.currency)}
                  <Text style={[styles.caption, { color: colors.textMuted }]}>
                    {'  '}
                    {total.count} {total.count === 1 ? 'expense' : 'expenses'}
                  </Text>
                </Text>
              ))
            )}
          </Card>
        ) : null}

        {report.isLoading ? (
          <SkeletonRows rows={4} />
        ) : report.isError ? (
          <ErrorState message={errorMessage(report.error)} onRetry={() => void report.refetch()} />
        ) : !data || data.categories.length === 0 ? (
          <EmptyState
            title="Nothing recorded"
            message="Record an expense and it appears here by category."
          />
        ) : (
          <Card style={styles.listCard}>
            {data.categories.map((row, index) => (
              <View
                key={`${row.category}-${row.currency}`}
                style={[
                  styles.row,
                  index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.category, { color: colors.text }]}>
                    {EXPENSE_CATEGORY_LABELS[row.category]}
                  </Text>
                  <Text style={[styles.caption, { color: colors.textMuted }]}>
                    {row.count} {row.count === 1 ? 'expense' : 'expenses'}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatMoney(row.amount, row.currency)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <Text style={[styles.caption, { color: colors.textMuted }]}>
          Categories are never added across currencies.
        </Text>
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
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  totalCard: {
    gap: spacing.xs,
  },
  caption: {
    ...typeScale.small,
  },
  total: {
    ...typeScale.title,
  },
  listCard: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  category: {
    ...typeScale.bodyStrong,
  },
  amount: {
    ...typeScale.bodyStrong,
  },
});
