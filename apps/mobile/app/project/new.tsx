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
  useCreateProject,
  useDeleteProject,
  useProfile,
  useProject,
  useUpdateProject,
} from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ClientPicker } from '../../src/components/ClientPicker';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Skeleton } from '../../src/components/Skeleton';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { amountToInput, parseAmountToMinor } from '../../src/lib/money';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { ProjectStatus } from '../../src/api/types';

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

function optionalDate(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : undefined;
}

/** Create or edit a project. Money fields are entered in major units. */
export default function ProjectFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const project = useProject(id);
  const profile = useProfile();
  const create = useCreateProject();
  const update = useUpdateProject(id ?? '');
  const remove = useDeleteProject();
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const currency = profile.data?.business.currency ?? 'USD';

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [rate, setRate] = useState('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = project.data?.project;
    if (!current) return;
    setName(current.name);
    setClientId(current.clientId);
    setClientName(current.clientName);
    setStatus(current.status);
    setRate(
      current.hourlyRateMinor === null
        ? ''
        : amountToInput(current.hourlyRateMinor, current.currency),
    );
    setBudget(
      current.budgetMinor === null ? '' : amountToInput(current.budgetMinor, current.currency),
    );
    setStartDate(current.startDate ?? '');
    setDueDate(current.dueDate ?? '');
    setNotes(current.notes ?? '');
  }, [project.data]);

  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name the project');
      return;
    }
    for (const [field, value] of [
      ['start date', startDate],
      ['due date', dueDate],
    ] as const) {
      if (value.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        setError(`Use a ${field} like 2026-11-24`);
        return;
      }
    }

    const rateMinor = rate.trim() ? parseAmountToMinor(rate, currency) : null;
    if (rate.trim() && rateMinor === null) {
      setError('Hourly rate is not a valid amount');
      return;
    }
    const budgetMinor = budget.trim() ? parseAmountToMinor(budget, currency) : null;
    if (budget.trim() && budgetMinor === null) {
      setError('Budget is not a valid amount');
      return;
    }

    const input = {
      name: name.trim(),
      ...(clientId ? { clientId } : {}),
      status,
      currency,
      ...(rateMinor !== null ? { hourlyRateMinor: rateMinor } : {}),
      ...(budgetMinor !== null ? { budgetMinor } : {}),
      ...(optionalDate(startDate) ? { startDate: optionalDate(startDate) } : {}),
      ...(optionalDate(dueDate) ? { dueDate: optionalDate(dueDate) } : {}),
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
    Alert.alert('Delete this project?', 'Projects with time or invoices can only be archived.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove.mutate(id, {
            onSuccess: () => router.back(),
            onError: (caught) => setError(errorMessage(caught)),
          });
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
              {id ? 'Edit project' : 'New project'}
            </Text>
            <View style={styles.topSpacer} />
          </View>

          {id && project.isLoading ? (
            <View style={styles.loading}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={92} />
            </View>
          ) : id && project.isError ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {errorMessage(project.error)}
              </Text>
            </Card>
          ) : (
            <>
              <TextField
                label="Project name"
                value={name}
                onChangeText={setName}
                placeholder="Website rebuild"
                maxLength={200}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose client"
                onPress={() => setClientPickerOpen(true)}
              >
                <TextField
                  label="Client (optional)"
                  value={clientName ?? ''}
                  onChangeText={() => undefined}
                  placeholder="Choose a client"
                  editable={false}
                  pointerEvents="none"
                />
              </Pressable>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Status</Text>
                <Segmented
                  options={STATUS_OPTIONS}
                  value={status}
                  onChange={setStatus}
                  accessibilityLabel="Project status"
                />
              </View>

              <TextField
                label={`Hourly rate (${currency}, optional)`}
                value={rate}
                onChangeText={setRate}
                placeholder="95.00"
                keyboardType="decimal-pad"
                maxLength={14}
                hint="Used as the default rate when tracking time"
              />

              <TextField
                label={`Budget (${currency}, optional)`}
                value={budget}
                onChangeText={setBudget}
                placeholder="5000.00"
                keyboardType="decimal-pad"
                maxLength={14}
              />

              <TextField
                label="Start date (optional)"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="2026-11-24"
                maxLength={10}
              />

              <TextField
                label="Due date (optional)"
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="2026-12-31"
                maxLength={10}
              />

              <TextField
                label="Notes (optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Scope, milestones, anything useful"
                multiline
                maxLength={2000}
              />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Button
                title={id ? 'Save changes' : 'Create project'}
                onPress={() => void save()}
                loading={busy}
              />

              {id ? (
                <Button
                  title="Delete project"
                  variant="ghost"
                  onPress={confirmDelete}
                  loading={remove.isPending}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ClientPicker
        visible={clientPickerOpen}
        selectedId={clientId}
        onSelect={(client) => {
          setClientId(client.id);
          setClientName(client.name);
          setClientPickerOpen(false);
        }}
        onClose={() => setClientPickerOpen(false)}
        onCreate={() => {
          setClientPickerOpen(false);
          router.push('/client/new');
        }}
      />
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
  error: {
    ...typeScale.small,
  },
});
