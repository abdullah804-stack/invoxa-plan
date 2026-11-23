import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../../src/api/client';
import { useProfile } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
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

  const business = profile.data?.business;
  const canEditBrand = activeRole ? can(activeRole, 'brand:update') : false;
  const version = Constants.expoConfig?.version ?? '0.1.0';

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
