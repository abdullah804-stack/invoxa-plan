import { loginSchema } from '@invoxa/shared';
import { useRouter } from 'expo-router';
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
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { useSession } from '../src/auth/SessionProvider';
import { errorMessage, fieldErrors } from '../src/lib/errors';
import { zodFieldErrors } from '../src/lib/validation';
import { spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitError(null);
    setBusy(true);
    try {
      await signIn({ email: parsed.data.email, password: parsed.data.password });
      router.replace('/');
    } catch (error) {
      setErrors(fieldErrors(error));
      setSubmitError(errorMessage(error));
    } finally {
      setBusy(false);
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Sign in to see what you are owed.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@business.com"
              error={errors['email']}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoCorrect={false}
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              error={errors['password']}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
            />

            {submitError ? (
              <Text style={[styles.error, { color: colors.danger }]}>{submitError}</Text>
            ) : null}

            <Button title="Sign in" onPress={() => void submit()} loading={busy} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/register')}
            style={styles.switchRow}
          >
            <Text style={[styles.switchText, { color: colors.textMuted }]}>
              New to Invoxa?{' '}
              <Text style={{ color: colors.accent, fontFamily: typeScale.bodyStrong.fontFamily }}>
                Create an account
              </Text>
            </Text>
          </Pressable>
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
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typeScale.display,
  },
  subtitle: {
    ...typeScale.body,
  },
  form: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  error: {
    ...typeScale.small,
  },
  switchRow: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  switchText: {
    ...typeScale.small,
  },
});
