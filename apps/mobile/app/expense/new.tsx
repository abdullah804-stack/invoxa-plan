import { EXPENSE_CATEGORY_LABELS, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useProfile,
  useUpdateExpense,
} from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { amountToInput, parseAmountToMinor } from '../../src/lib/money';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { ExpenseCategory } from '../../src/api/types';

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add or edit one expense. The amount is parsed to minor units before saving. */
export default function ExpenseFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const expense = useExpense(id);
  const profile = useProfile();
  const create = useCreateExpense();
  const update = useUpdateExpense(id ?? '');
  const remove = useDeleteExpense();

  const currency = profile.data?.business.currency ?? 'USD';

  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = expense.data?.expense;
    if (!current) return;
    setDate(current.date);
    setCategory(current.category);
    setDescription(current.description);
    setVendor(current.vendor ?? '');
    setAmount(amountToInput(current.amount, current.currency));
    setNotes(current.notes ?? '');
  }, [expense.data]);

  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    setError(null);
    if (!description.trim()) {
      setError('Say what the expense was for');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Use a date like 2026-11-24');
      return;
    }
    const minor = parseAmountToMinor(amount, currency);
    if (minor === null || minor <= 0) {
      setError('Enter an amount more than zero');
      return;
    }

    const input = {
      date: date.trim(),
      category,
      description: description.trim(),
      amount: minor,
      currency,
      ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      if (id) {
        await update.mutateAsync(input);
      } else {
        await create.mutateAsync(input);
      }
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert('Delete this expense?', 'It will be removed from every total.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove.mutate(id, { onSuccess: () => router.back() });
        },
      },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>
              {id ? 'Edit expense' : 'New expense'}
            </Text>
            <View style={styles.topSpacer} />
          </View>

          {id && expense.isLoading ? (
            <View style={styles.loading}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={92} />
            </View>
          ) : id && expense.isError ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {errorMessage(expense.error)}
              </Text>
            </Card>
          ) : (
            <>
              <TextField
                label="What was it for?"
                value={description}
                onChangeText={setDescription}
                placeholder="Design tool subscription"
                maxLength={500}
              />

              <TextField
                label={`Amount (${currency})`}
                value={amount}
                onChangeText={setAmount}
                placeholder="24.00"
                keyboardType="decimal-pad"
                maxLength={14}
              />

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Category</Text>
                <View style={styles.chips}>
                  {CATEGORIES.map(([value, label]) => (
                    <FilterChip
                      key={value}
                      label={label}
                      selected={category === value}
                      onPress={() => setCategory(value)}
                    />
                  ))}
                </View>
              </View>

              <TextField
                label="Date"
                value={date}
                onChangeText={setDate}
                placeholder="2026-11-24"
                maxLength={10}
                hint="The day the money was spent"
              />

              <TextField
                label="Paid to (optional)"
                value={vendor}
                onChangeText={setVendor}
                placeholder="Figma"
                maxLength={200}
              />

              <TextField
                label="Notes (optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Annual plan, paid by card"
                multiline
                maxLength={2000}
              />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              {id && expense.data ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  Saved as {formatMoney(expense.data.expense.amount, expense.data.expense.currency)}
                  . Editing changes every total that includes it.
                </Text>
              ) : null}

              <Button
                title={id ? 'Save changes' : 'Add expense'}
                onPress={() => void save()}
                loading={busy}
              />

              {id ? (
                <Button
                  title="Delete expense"
                  variant="ghost"
                  onPress={confirmDelete}
                  loading={remove.isPending}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  loading: {
    gap: spacing.md,
  },
  body: {
    ...typeScale.body,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  error: {
    ...typeScale.small,
  },
  hint: {
    ...typeScale.small,
  },
});
