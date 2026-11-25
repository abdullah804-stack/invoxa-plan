import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { checkBiometrics, loadAppLock, unlockWithBiometrics } from '../lib/appLock';
import { spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from './SessionProvider';

/**
 * A local lock over the whole app. It hides the screen after the configured
 * time in the background and asks the OS to confirm the owner before anything
 * is shown again. The setting is read from this phone, not the server.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { status } = useSession();

  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState('fingerprint or face');
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [settings, support] = await Promise.all([loadAppLock(), checkBiometrics()]);
      if (!active) return;
      setLabel(support.label);
      // Enabled but unusable on this device would strand the user.
      if (settings.enabled && support.available && support.enrolled) setLocked(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
        return;
      }
      if (next !== 'active' || backgroundAt.current === null) return;

      const elapsed = Date.now() - backgroundAt.current;
      backgroundAt.current = null;

      void (async () => {
        const [settings, support] = await Promise.all([loadAppLock(), checkBiometrics()]);
        setLabel(support.label);
        if (
          settings.enabled &&
          support.available &&
          support.enrolled &&
          elapsed >= settings.timeoutMinutes * 60_000
        ) {
          setLocked(true);
        }
      })();
    });

    return () => subscription.remove();
  }, []);

  // Signing out must never leave someone staring at a lock screen.
  useEffect(() => {
    if (status !== 'signedIn') setLocked(false);
  }, [status]);

  const attemptUnlock = async () => {
    setNotice(null);
    setChecking(true);
    const ok = await unlockWithBiometrics();
    setChecking(false);
    if (ok) {
      setLocked(false);
      return;
    }
    setNotice('Could not unlock. Try again.');
  };

  return (
    <View style={styles.root}>
      {children}
      {locked && status === 'signedIn' ? (
        <View style={[styles.overlay, { backgroundColor: colors.background }]}>
          <View style={[styles.mark, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="lock-closed" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Invoxa is locked</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Unlock with your {label} to see your business again.
          </Text>
          {notice ? <Text style={[styles.body, { color: colors.danger }]}>{notice}</Text> : null}
          <Button
            title="Unlock"
            onPress={() => void attemptUnlock()}
            loading={checking}
            style={styles.action}
          />
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            The lock is set on this phone. Your data stays signed in until you sign out.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    zIndex: 10,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.display,
    textAlign: 'center',
  },
  body: {
    ...typeScale.body,
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  footnote: {
    ...typeScale.tiny,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
