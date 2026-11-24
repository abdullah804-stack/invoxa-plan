import { can, EXPENSE_CATEGORY_LABELS, formatDate, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExpenses } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Card } from '../../src/components/Card';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { ExpenseCategory } from '../../src/api/types';

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

/**
 * Money out, listed newest first with this month's total per currency. Expenses
 * never change an invoice total; they exist so the business can see its costs.
 */
export default function ExpensesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const expenses = useExpenses(category ? { category } : {});
  const canWrite = activeRole ? can(activeRole, 'expenses:write') : false;

  const data = expenses.data;
  const monthTotals = data?.month.totals ?? [];

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={expenses.isRefetching}
            onRefresh={() => void expenses.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Expenses</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expense report"
            onPress={() => router.push('/expense/report')}
            hitSlop={8}
            style={styles.reportLink}
          >
            <Text style={[styles.reportText, { color: colors.accent }]}>Report</Text>
          </Pressable>
          {canWrite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add expense"
              onPress={() => router.push('/expense/new')}
              style={[styles.addButton, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="add" size={22} color={colors.onAccent} />
            </Pressable>
          ) : null}
        </View>

        <Card style={styles.totalCard}>
          <Text style={[styles.caption, { color: colors.textMuted }]}>This month</Text>
          {monthTotals.length === 0 ? (
            <Text style={[styles.emptyTotal, { color: colors.text }]}>Nothing recorded yet</Text>
          ) : (
            monthTotals.map((total) => (
              <Text key={total.currency} style={[styles.total, { color: colors.text }]}>
                {formatMoney(total.amount, total.currency)}
              </Text>
            ))
          )}
          {data ? (
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              Showing {data.expenses.length} {data.expenses.length === 1 ? 'expense' : 'expenses'}
              {category ? ` in ${EXPENSE_CATEGORY_LABELS[category]}` : ''}
            </Text>
          ) : null}
        </Card>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <FilterChip label="All" selected={!category} onPress={() => setCategory(undefined)} />
          {CATEGORY_OPTIONS.map(([value, label]) => (
            <FilterChip
              key={value}
              label={label}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </ScrollView>

        {expenses.isLoading ? (
          <SkeletonRows rows={4} />
        ) : expenses.isError ? (
          <ErrorState
            message={errorMessage(expenses.error)}
            onRetry={() => void expenses.refetch()}
          />
        ) : !data || data.expenses.length === 0 ? (
          <EmptyState
            title={category ? 'Nothing in that category' : 'No expenses yet'}
            message="Record software, travel, meals and other costs to see what the business spends."
            {...(canWrite
              ? { actionTitle: 'Add expense', onAction: () => router.push('/expense/new') }
              : {})}
          />
        ) : (
          <Card style={styles.listCard}>
            {data.expenses.map((expense, index) => (
              <Pressable
                key={expense.id}
                accessibilityRole="button"
                accessibilityLabel={`${expense.description}, ${formatMoney(expense.amount, expense.currency)}`}
                onPress={() => router.push(`/expense/new?id=${expense.id}`)}
                style={[
                  styles.row,
                  index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.description, { color: colors.text }]} numberOfLines={1}>
                    {expense.description}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {EXPENSE_CATEGORY_LABELS[expense.category]}
                    {expense.vendor ? ` · ${expense.vendor}` : ''} · {formatDate(expense.date)}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatMoney(expense.amount, expense.currency)}
                </Text>
              </Pressable>
            ))}
          </Card>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    ...typeScale.title,
    flex: 1,
  },
  reportLink: {
    paddingHorizontal: spacing.xs,
  },
  reportText: {
    ...typeScale.small,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyTotal: {
    ...typeScale.bodyStrong,
  },
  filters: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  listCard: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  description: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
  amount: {
    ...typeScale.bodyStrong,
  },
});
