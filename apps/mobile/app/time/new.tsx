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
  Switch,
  Text,
  View,
} from 'react-native';
import { useCreateTimeEntry, useProject } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { amountToInput, parseAmountToMinor } from '../../src/lib/money';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One tracked block of time on a project, with its rate snapshotted. */
export default function NewTimeEntryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = typeof params.projectId === 'string' ? params.projectId : undefined;
  const project = useProject(projectId);
  const create = useCreateTimeEntry(projectId ?? '');

  const detail = project.data?.project;
  const currency = detail?.currency ?? 'USD';

  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState('60');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState(
    typeof detail?.hourlyRateMinor === 'number'
      ? amountToInput(detail.hourlyRateMinor, detail.currency)
      : '',
  );
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!projectId) {
      setError('Open a project first');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Use a date like 2026-11-24');
      return;
    }
    const totalMinutes = Number(minutes.trim());
    if (!Number.isInteger(totalMinutes) || totalMinutes < 1 || totalMinutes > 1440) {
      setError('Enter whole minutes from 1 to 1440');
      return;
    }
    if (!description.trim()) {
      setError('Say what you did');
      return;
    }
    const rateMinor = parseAmountToMinor(rate, currency);
    if (rateMinor === null) {
      setError('Enter the hourly rate');
      return;
    }

    try {
      await create.mutateAsync({
        projectId,
        date: date.trim(),
        minutes: totalMinutes,
        description: description.trim(),
        hourlyRateMinor: rateMinor,
        billable,
      });
      router.back();
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
            <Text style={[styles.title, { color: colors.text }]}>Add time</Text>
            <View style={styles.topSpacer} />
          </View>

          {projectId && project.isLoading ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>Loading the project…</Text>
            </Card>
          ) : !detail ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {project.isError ? errorMessage(project.error) : 'That project could not be found.'}
              </Text>
            </Card>
          ) : (
            <>
              <Card style={styles.summary}>
                <Text style={[styles.project, { color: colors.text }]} numberOfLines={1}>
                  {detail.name}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {formatMoney(detail.hourlyRateMinor ?? 0, currency)}/hr default ·{' '}
                  {detail.clientName ?? 'No client'}
                </Text>
              </Card>

              <TextField
                label="Minutes"
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
                maxLength={4}
                hint="For example 90 for an hour and a half"
              />

              <TextField
                label="What did you do?"
                value={description}
                onChangeText={setDescription}
                placeholder="Design revisions"
                maxLength={500}
              />

              <TextField
                label={`Hourly rate (${currency})`}
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
                maxLength={14}
                hint="Saved with this entry; later rate changes do not touch it"
              />

              <TextField
                label="Date"
                value={date}
                onChangeText={setDate}
                maxLength={10}
                placeholder="2026-11-24"
              />

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={[styles.project, { color: colors.text }]}>Billable</Text>
                  <Text style={[styles.body, { color: colors.textMuted }]}>
                    Billable time can be turned into an invoice.
                  </Text>
                </View>
                <Switch
                  value={billable}
                  onValueChange={setBillable}
                  accessibilityLabel="Billable"
                  trackColor={{ true: colors.accentSoft, false: colors.surfaceMuted }}
                  thumbColor={billable ? colors.accent : colors.surface}
                />
              </View>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Button title="Save time" onPress={() => void submit()} loading={create.isPending} />
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
  project: {
    ...typeScale.bodyStrong,
  },
  body: {
    ...typeScale.body,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  error: {
    ...typeScale.small,
  },
});
