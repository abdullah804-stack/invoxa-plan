import { APP_TAGLINE } from '@invoxa/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { radius, spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: colors.accent }]}>
            <Text style={[styles.markText, { color: colors.onAccent }]}>In</Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>Invoxa</Text>
          <Text style={[styles.tagline, { color: colors.text }]}>{APP_TAGLINE}</Text>
          <Text style={[styles.blurb, { color: colors.textMuted }]}>
            Create an invoice from your phone in under a minute. Track who has paid, and see what is
            still owed at a glance.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button title="Create your account" onPress={() => router.push('/register')} />
          <Button
            title="I already have an account"
            variant="secondary"
            onPress={() => router.push('/login')}
          />
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Free to start. No card details.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  markText: {
    ...typeScale.title,
  },
  name: {
    ...typeScale.display,
  },
  tagline: {
    ...typeScale.section,
  },
  blurb: {
    ...typeScale.body,
    marginTop: spacing.sm,
    maxWidth: 420,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  footnote: {
    ...typeScale.small,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
