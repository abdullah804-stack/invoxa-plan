import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDeleteAccount } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const LOSSES = [
  'Your account, name, email and password.',
  'Every business you are the only member of, with its clients, invoices, estimates, credit notes, payments, expenses, projects, tracked time and saved items.',
  'Your activity log and AI usage counters.',
];

/** Deleting needs the password, and removes what nobody else depends on. */
export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const remove = useDeleteAccount();

  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const confirm = () => {
    if (!password) {
      setNotice('Enter your password');
      return;
    }
    setNotice(null);

    Alert.alert(
      'Delete your account?',
      'This cannot be undone. Export a backup first if you might need the records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void remove.mutateAsync(password).catch((error) => {
              setNotice(errorMessage(error));
            });
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Delete account</Text>
          <View style={styles.topSpacer} />
        </View>

        <Card style={styles.card}>
          <Text style={[styles.heading, { color: colors.danger }]}>This removes</Text>
          {LOSSES.map((loss) => (
            <Text key={loss} style={[styles.body, { color: colors.textMuted }]}>
              • {loss}
            </Text>
          ))}
          <Text style={[styles.body, { color: colors.textMuted }]}>
            If someone else still works in a business you own, transfer ownership or remove them
            before deleting.
          </Text>
        </Card>

        <Card style={styles.card}>
          <TextField
            label="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Confirm it is you"
          />
          {notice ? <Text style={[styles.body, { color: colors.danger }]}>{notice}</Text> : null}
          <Button
            title="Delete my account"
            variant="danger"
            onPress={confirm}
            loading={remove.isPending}
          />
        </Card>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Want a copy first? Backup &amp; restore writes a JSON file of the active business.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 24,
  },
  card: {
    gap: spacing.sm,
  },
  heading: {
    ...typeScale.bodyStrong,
  },
  body: {
    ...typeScale.body,
  },
  footnote: {
    ...typeScale.small,
    textAlign: 'center',
  },
});
