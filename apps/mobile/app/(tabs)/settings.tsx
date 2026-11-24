import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { API_URL } from '../../src/api/client';
import { useProfile, useUpdateProfile } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { ensureNotificationPermission } from '../../src/lib/reminders';
import { spacing, typeScale, type ThemeMode } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user, activeRole, signOut } = useSession();
  const profile = useProfile();
  const router = useRouter();

  const updateProfile = useUpdateProfile();
  const business = profile.data?.business;
  const canEditBrand = activeRole ? can(activeRole, 'brand:update') : false;
  const canManageReminders = activeRole ? can(activeRole, 'business:update') : false;
  const canRepeat = activeRole ? can(activeRole, 'drafts:create') : false;
  const canSeeProjects = activeRole ? can(activeRole, 'projects:read') : false;
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState('9');
  const [reminderDays, setReminderDays] = useState('2');
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  useEffect(() => {
    const reminders = business?.reminders;
    if (!reminders) return;
    setRemindersEnabled(reminders.enabled);
    setReminderHour(String(reminders.hour));
    setReminderDays(String(reminders.daysBefore));
  }, [business?.id, business?.reminders]);

  const saveReminders = async () => {
    setReminderNotice(null);
    const hour = Number(reminderHour.trim());
    const days = Number(reminderDays.trim());
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setReminderNotice('Choose an hour from 0 to 23');
      return;
    }
    if (!Number.isInteger(days) || days < 0 || days > 7) {
      setReminderNotice('Choose 0 to 7 days before the due date');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        reminders: { enabled: remindersEnabled, hour, daysBefore: days },
      });
      if (!remindersEnabled) {
        setReminderNotice('Saved. Due-date reminders are off.');
        return;
      }
      const allowed = await ensureNotificationPermission();
      setReminderNotice(
        allowed
          ? 'Saved. Reminders are scheduled on this phone.'
          : 'Saved in the app. Notifications are blocked in your phone settings.',
      );
    } catch (error) {
      setReminderNotice(errorMessage(error));
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Business</Text>
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                  {business?.name ?? 'Loading…'}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {business?.email || 'No email yet'}
                </Text>
              </View>
              {canEditBrand ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit business and brand"
                  onPress={() => router.push('/onboarding')}
                  style={styles.editButton}
                >
                  <Text style={[styles.editLabel, { color: colors.accent }]}>Edit</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
            {business ? (
              <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
                <View style={styles.meta}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Currency</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {business.currency}
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Terms</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {business.dueDays} days
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Numbers</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {business.numbering.invoice}-
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        </View>

        {canManageReminders ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Reminders</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Due-date notifications
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    A local notification before an invoice is due.
                  </Text>
                </View>
                <Switch
                  value={remindersEnabled}
                  onValueChange={setRemindersEnabled}
                  accessibilityLabel="Due-date notifications"
                  trackColor={{ true: colors.accentSoft, false: colors.surfaceMuted }}
                  thumbColor={remindersEnabled ? colors.accent : colors.surface}
                />
              </View>
              <View style={styles.reminderFields}>
                <View style={styles.reminderField}>
                  <TextField
                    label="Hour (0-23)"
                    value={reminderHour}
                    onChangeText={setReminderHour}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
                <View style={styles.reminderField}>
                  <TextField
                    label="Days before"
                    value={reminderDays}
                    onChangeText={setReminderDays}
                    keyboardType="number-pad"
                    maxLength={1}
                  />
                </View>
              </View>
              {reminderNotice ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>{reminderNotice}</Text>
              ) : null}
              <Button
                title="Save reminders"
                variant="secondary"
                onPress={() => void saveReminders()}
                loading={updateProfile.isPending}
              />
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Reminders are local to this phone. Nothing is emailed.
              </Text>
            </Card>
          </View>
        ) : null}

        {canSeeProjects ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Work</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Projects"
              onPress={() => router.push('/projects')}
            >
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>Projects</Text>
                    <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                      Budgets, hourly rates and tracked time.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </View>
              </Card>
            </Pressable>
          </View>
        ) : null}

        {canRepeat ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Automation</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recurring invoices"
              onPress={() => router.push('/recurring')}
            >
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      Recurring invoices
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                      Repeat an invoice and manage its schedule.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </View>
              </Card>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Appearance</Text>
          <Segmented
            options={THEME_OPTIONS}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Theme"
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            System follows your phone's light or dark setting.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Account</Text>
          <Card style={styles.card}>
            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
              {user?.name ?? 'Signed in'}
            </Text>
            <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
            {activeRole ? (
              <Text
                style={[styles.badge, { color: colors.accent, backgroundColor: colors.accentSoft }]}
              >
                {activeRole}
              </Text>
            ) : null}
          </Card>
          <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
        </View>

        <View style={styles.about}>
          <Text style={[styles.aboutText, { color: colors.textMuted }]}>
            Invoxa {version} · Say it. Send it. Get paid.
          </Text>
          <Text style={[styles.aboutText, { color: colors.textMuted }]} numberOfLines={1}>
            {API_URL}
          </Text>
        </View>
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
  title: {
    ...typeScale.display,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typeScale.bodyStrong,
  },
  rowSubtitle: {
    ...typeScale.small,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editLabel: {
    ...typeScale.small,
  },
  metaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    ...typeScale.bodyStrong,
  },
  hint: {
    ...typeScale.small,
  },
  reminderFields: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  reminderField: {
    flex: 1,
  },
  badge: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  about: {
    gap: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  aboutText: {
    ...typeScale.small,
    textAlign: 'center',
  },
});
