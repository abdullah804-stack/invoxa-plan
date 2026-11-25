import { can, type SupportedLanguage } from '@invoxa/shared';
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
import {
  APP_LOCK_TIMEOUTS,
  checkBiometrics,
  loadAppLock,
  saveAppLock,
  type AppLockSettings,
  type BiometricSupport,
} from '../../src/lib/appLock';
import { errorMessage } from '../../src/lib/errors';
import { amountToInput, parseAmountToMinor } from '../../src/lib/money';
import { ensureNotificationPermission } from '../../src/lib/reminders';
import { spacing, typeScale, type ThemeMode } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
];

const LATE_FEE_OPTIONS: { value: 'percent' | 'fixed'; label: string }[] = [
  { value: 'percent', label: 'Percent' },
  { value: 'fixed', label: 'Fixed amount' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user, activeRole, signOut, businesses, activeBusinessId, setActiveBusiness } =
    useSession();
  const profile = useProfile();
  const router = useRouter();

  const updateProfile = useUpdateProfile();
  const business = profile.data?.business;
  const canEditBrand = activeRole ? can(activeRole, 'brand:update') : false;
  const canManageReminders = activeRole ? can(activeRole, 'business:update') : false;
  const canRepeat = activeRole ? can(activeRole, 'drafts:create') : false;
  const canManageLateFee = activeRole ? can(activeRole, 'lateFee:configure') : false;
  const canReadActivity = activeRole ? can(activeRole, 'activity:read') : false;
  const canBackup = activeRole ? can(activeRole, 'backup:export') : false;
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState('9');
  const [reminderDays, setReminderDays] = useState('2');
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
  const [lateFeeType, setLateFeeType] = useState<'percent' | 'fixed'>('percent');
  const [lateFeeValue, setLateFeeValue] = useState('');
  const [lateFeeGrace, setLateFeeGrace] = useState('0');
  const [lateFeeNotice, setLateFeeNotice] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetRate, setPresetRate] = useState('');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [appLock, setAppLock] = useState<AppLockSettings | null>(null);
  const [biometrics, setBiometrics] = useState<BiometricSupport | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  const currency = business?.currency ?? 'USD';
  const taxPresets = business?.taxPresets ?? [];

  const savePresets = (
    next: { name: string; rateBp: number; note?: string | null }[],
    message: string,
  ) => {
    updateProfile.mutate(
      { taxPresets: next },
      {
        onSuccess: () => setPresetNotice(message),
        onError: (error) => setPresetNotice(errorMessage(error)),
      },
    );
  };

  const addTaxPreset = () => {
    const name = presetName.trim();
    const percent = Number(presetRate.trim().replace(',', '.'));
    if (!name) {
      setPresetNotice('Give the rate a name, such as VAT 20%.');
      return;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setPresetNotice('Enter a rate between 0 and 100.');
      return;
    }
    if (taxPresets.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
      setPresetNotice('That name is already saved. Remove it first to change the rate.');
      return;
    }
    savePresets(
      [
        ...taxPresets.map((preset) => ({
          name: preset.name,
          rateBp: preset.rateBp,
          note: preset.note,
        })),
        {
          name,
          rateBp: Math.round(percent * 100),
          note: 'Check your local rate.',
        },
      ],
      'Preset saved. It appears in the invoice editor.',
    );
    setPresetName('');
    setPresetRate('');
  };

  const removeTaxPreset = (name: string) => {
    savePresets(
      taxPresets
        .filter((preset) => preset.name !== name)
        .map((preset) => ({ name: preset.name, rateBp: preset.rateBp, note: preset.note })),
      'Preset removed.',
    );
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const [settings, support] = await Promise.all([loadAppLock(), checkBiometrics()]);
      if (!active) return;
      setAppLock(settings);
      setBiometrics(support);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLockEnabled = async (enabled: boolean) => {
    if (!appLock) return;
    if (enabled && (!biometrics?.available || !biometrics.enrolled)) {
      setLockNotice('Set up a fingerprint or face in your phone settings first.');
      return;
    }
    const next = { ...appLock, enabled };
    setAppLock(next);
    await saveAppLock(next);
    setLockNotice(
      enabled
        ? 'Saved. The app locks itself after the time you choose below.'
        : 'Saved. App lock is off.',
    );
  };

  const setLockTimeout = async (value: string) => {
    if (!appLock) return;
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    const next = { ...appLock, timeoutMinutes: minutes };
    setAppLock(next);
    await saveAppLock(next);
    setLockNotice('Saved. This setting stays on this phone.');
  };

  useEffect(() => {
    const reminders = business?.reminders;
    if (!reminders) return;
    setRemindersEnabled(reminders.enabled);
    setReminderHour(String(reminders.hour));
    setReminderDays(String(reminders.daysBefore));
  }, [business?.id, business?.reminders]);

  useEffect(() => {
    const rule = business?.lateFee;
    if (!rule) return;
    setLateFeeEnabled(rule.enabled);
    setLateFeeType(rule.type);
    setLateFeeValue(
      rule.type === 'percent'
        ? rule.value > 0
          ? String(rule.value / 100)
          : ''
        : amountToInput(rule.value, business?.currency ?? 'USD'),
    );
    setLateFeeGrace(String(rule.graceDays));
  }, [business?.id, business?.lateFee, business?.currency]);

  const saveLateFee = async () => {
    setLateFeeNotice(null);
    const days = Number(lateFeeGrace.trim());
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      setLateFeeNotice('Choose 0 to 365 grace days');
      return;
    }

    let value: number;
    if (lateFeeType === 'percent') {
      const percent = Number(lateFeeValue.trim().replace(',', '.'));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        setLateFeeNotice('Enter a percentage from 0 to 100');
        return;
      }
      value = Math.round(percent * 100);
    } else {
      const minor = parseAmountToMinor(lateFeeValue, currency);
      if (minor === null) {
        setLateFeeNotice('Enter a fee amount');
        return;
      }
      value = minor;
    }

    try {
      await updateProfile.mutateAsync({
        lateFee: { enabled: lateFeeEnabled, type: lateFeeType, value, graceDays: days },
      });
      setLateFeeNotice(
        lateFeeEnabled
          ? 'Saved. Late fees are never added automatically; you confirm each one.'
          : 'Saved. Late fees are off.',
      );
    } catch (error) {
      setLateFeeNotice(errorMessage(error));
    }
  };

  useEffect(() => {
    const saved = business?.language;
    if (saved === 'en' || saved === 'es' || saved === 'fr') setLanguage(saved);
  }, [business?.language]);

  const saveLanguage = async (value: SupportedLanguage) => {
    const previous = language;
    setLanguage(value);
    setLanguageNotice(null);
    try {
      await updateProfile.mutateAsync({ language: value });
    } catch (error) {
      setLanguage(previous);
      setLanguageNotice(errorMessage(error));
    }
  };

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
            {businesses.length > 1 ? (
              <View style={styles.switcher}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Active business</Text>
                <Segmented
                  options={businesses.map((entry) => ({
                    value: entry.id,
                    label: entry.name.length > 14 ? `${entry.name.slice(0, 13)}…` : entry.name,
                  }))}
                  value={activeBusinessId ?? ''}
                  onChange={(id) => setActiveBusiness(id)}
                  accessibilityLabel="Switch business"
                />
              </View>
            ) : null}
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
            {business && canManageReminders ? (
              <View style={[styles.languageBlock, { borderTopColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
                  Invoice language
                </Text>
                <Segmented
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={(value) => void saveLanguage(value)}
                  accessibilityLabel="Invoice language"
                />
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  New invoices and PDFs print in this language. Issued ones keep the language they
                  were sent with.
                </Text>
                {languageNotice ? (
                  <Text style={[styles.hint, { color: colors.danger }]}>{languageNotice}</Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        </View>

        {canManageReminders ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Tax presets</Text>
            <Card style={styles.card}>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Save the rates you use so they become one-tap chips in the invoice editor. Invoxa
                does not set tax rates for you: check your local tax authority.
              </Text>
              {taxPresets.length === 0 ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>No presets yet.</Text>
              ) : (
                taxPresets.map((preset) => (
                  <View key={preset.name} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{preset.name}</Text>
                      <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                        {preset.rateBp / 100}%{preset.note ? ` · ${preset.note}` : ''}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${preset.name}`}
                      onPress={() => removeTaxPreset(preset.name)}
                      hitSlop={8}
                    >
                      <Text style={[styles.editLabel, { color: colors.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                ))
              )}
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <TextField
                    label="Name"
                    value={presetName}
                    onChangeText={setPresetName}
                    placeholder="VAT 20%"
                  />
                </View>
                <View style={styles.rowText}>
                  <TextField
                    label="Rate %"
                    value={presetRate}
                    onChangeText={setPresetRate}
                    placeholder="20"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Button
                title="Add preset"
                variant="secondary"
                onPress={addTaxPreset}
                loading={updateProfile.isPending}
              />
              {presetNotice ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>{presetNotice}</Text>
              ) : null}
            </Card>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Team</Text>
          <Card style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Team and roles"
              onPress={() => router.push('/business/team')}
            >
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Team & roles</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    Invite staff or viewers, change roles, transfer ownership.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </View>
            </Pressable>
            {canReadActivity ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Activity log"
                onPress={() => router.push('/activity')}
                style={[
                  styles.row,
                  { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Activity log</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    Who issued, recorded and changed what.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Businesses"
              onPress={() => router.push('/business')}
              style={[
                styles.row,
                { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Businesses</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                  Switch, create another, or join with an invite code.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </Pressable>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Security</Text>
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>App lock</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                  {biometrics?.available && biometrics.enrolled
                    ? `Ask for your ${biometrics.label} after the app has been in the background.`
                    : 'Set up a fingerprint or face in your phone settings to use this.'}
                </Text>
              </View>
              <Switch
                value={appLock?.enabled ?? false}
                onValueChange={(value) => void setLockEnabled(value)}
                disabled={!biometrics?.available || !biometrics?.enrolled}
                accessibilityLabel="App lock"
                trackColor={{ true: colors.accentSoft, false: colors.surfaceMuted }}
                thumbColor={appLock?.enabled ? colors.accent : colors.surface}
              />
            </View>
            {appLock?.enabled ? (
              <View style={[styles.languageBlock, { borderTopColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Lock after</Text>
                <Segmented
                  options={APP_LOCK_TIMEOUTS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={String(appLock.timeoutMinutes)}
                  onChange={(value) => void setLockTimeout(value)}
                  accessibilityLabel="App lock timeout"
                />
              </View>
            ) : null}
            {lockNotice ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>{lockNotice}</Text>
            ) : null}
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              The lock is local to this phone. The server never learns that it is on.
            </Text>
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

        {canManageLateFee ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Late fees</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Optional late fee</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    Off by default. You still confirm each fee on the invoice.
                  </Text>
                </View>
                <Switch
                  value={lateFeeEnabled}
                  onValueChange={setLateFeeEnabled}
                  accessibilityLabel="Late fee enabled"
                  trackColor={{ true: colors.accentSoft, false: colors.surfaceMuted }}
                  thumbColor={lateFeeEnabled ? colors.accent : colors.surface}
                />
              </View>
              <Segmented
                options={LATE_FEE_OPTIONS}
                value={lateFeeType}
                onChange={setLateFeeType}
                accessibilityLabel="Late fee type"
              />
              <View style={styles.reminderFields}>
                <View style={styles.reminderField}>
                  <TextField
                    label={lateFeeType === 'percent' ? 'Percent' : `Amount (${currency})`}
                    value={lateFeeValue}
                    onChangeText={setLateFeeValue}
                    keyboardType="decimal-pad"
                    placeholder={lateFeeType === 'percent' ? '1.5' : '0.00'}
                  />
                </View>
                <View style={styles.reminderField}>
                  <TextField
                    label="Grace days"
                    value={lateFeeGrace}
                    onChangeText={setLateFeeGrace}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              </View>
              <Button
                title="Save late fee"
                variant="secondary"
                onPress={() => void saveLateFee()}
                loading={updateProfile.isPending}
              />
              {lateFeeNotice ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>{lateFeeNotice}</Text>
              ) : null}
            </Card>
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
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Data & privacy</Text>
          <Card style={styles.card}>
            {canBackup ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Backup and restore"
                onPress={() => router.push('/backup')}
              >
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      Backup &amp; restore
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                      Export this business as JSON, or merge a file back in.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </View>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Privacy notice"
              onPress={() => router.push('/privacy')}
              style={[
                styles.row,
                canBackup
                  ? { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }
                  : null,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Privacy notice</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                  What is stored, what Gemini sees, and what stays on your phone.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={() => router.push('/account/delete')}
              style={[
                styles.row,
                { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.danger }]}>Delete account</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                  Remove your account and the businesses only you own.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} />
            </Pressable>
          </Card>
        </View>

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
  switcher: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  languageBlock: {
    gap: spacing.sm,
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
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
