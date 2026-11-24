import { formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCreateRecurring, useDocument } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

type Interval = 'weekly' | 'monthly' | 'yearly';

const INTERVALS: { value: Interval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function wholeNumber(value: string, min: number, max: number): number | null {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * A schedule copies one invoice, so there is no second builder to maintain.
 * Interval, count and payment terms are the only choices here.
 */
export default function NewRecurringScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ documentId?: string }>();
  const documentId = typeof params.documentId === 'string' ? params.documentId : undefined;
  const document = useDocument(documentId);
  const create = useCreateRecurring();

  const [interval, setInterval] = useState<Interval>('monthly');
  const [count, setCount] = useState('1');
  const [dueDays, setDueDays] = useState('14');
  const [error, setError] = useState<string | null>(null);

  const doc = document.data?.document;
  const total = doc ? doc.totals.total : 0;

  const submit = async () => {
    setError(null);
    if (!documentId) {
      setError('Open an invoice first');
      return;
    }
    const intervalCount = wholeNumber(count, 1, 12);
    if (intervalCount === null) {
      setError('Interval must be a whole number from 1 to 12');
      return;
    }
    const terms = wholeNumber(dueDays, 0, 90);
    if (terms === null) {
      setError('Payment terms must be a whole number from 0 to 90');
      return;
    }

    try {
      await create.mutateAsync({
        documentId,
        interval,
        intervalCount,
        dueDays: terms,
      });
      router.replace('/recurring');
    } catch (caught) {
      setError(errorMessage(caught));
    }
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
            <Text style={[styles.title, { color: colors.text }]}>Repeat invoice</Text>
            <View style={styles.topSpacer} />
          </View>

          {document.isLoading ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>Loading the invoice…</Text>
            </Card>
          ) : !doc ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {document.isError
                  ? errorMessage(document.error)
                  : 'That invoice could not be found.'}
              </Text>
            </Card>
          ) : (
            <>
              <Card style={styles.summary}>
                <Text style={[styles.client, { color: colors.text }]} numberOfLines={1}>
                  {doc.clientName ?? 'No client'}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {formatMoney(total, doc.currency)} · {doc.items.length}{' '}
                  {doc.items.length === 1 ? 'line' : 'lines'} copied from{' '}
                  {doc.number ?? 'this draft'}
                </Text>
              </Card>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>How often</Text>
                <Segmented
                  options={INTERVALS}
                  value={interval}
                  onChange={setInterval}
                  accessibilityLabel="Repeat interval"
                />
              </View>

              <TextField
                label={interval === 'weekly' ? 'Every how many weeks' : 'Every how many periods'}
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                maxLength={2}
                hint="1 to 12"
              />

              <TextField
                label="Payment terms (days)"
                value={dueDays}
                onChangeText={setDueDays}
                keyboardType="number-pad"
                maxLength={2}
                hint="Copied onto each draft as its due date"
              />

              <Text style={[styles.body, { color: colors.textMuted }]}>
                The first draft is made on the next check, using today's date. Each draft is a
                normal invoice you can edit, issue or delete; this schedule never issues one for
                you.
              </Text>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Button
                title="Start repeating"
                onPress={() => void submit()}
                loading={create.isPending}
              />
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
  summary: {
    gap: spacing.xs,
  },
  client: {
    ...typeScale.bodyStrong,
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
  error: {
    ...typeScale.small,
  },
});
