import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAcceptInvite } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/** One code, one person, one week. The code decides the business and the role. */
export default function JoinBusinessScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshBusinesses } = useSession();
  const accept = useAcceptInvite();

  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 8) {
      setNotice('Invite codes are 8 letters or numbers');
      return;
    }

    setNotice(null);
    try {
      const result = await accept.mutateAsync(cleaned);
      await refreshBusinesses(result.business.id);
      router.replace('/');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Join a business</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Ask the owner for an invite code. It works once and expires after seven days.
        </Text>

        <Card style={styles.card}>
          <TextField
            label="Invite code"
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder="ABCD2345"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
          />
          {notice ? <Text style={[styles.hint, { color: colors.danger }]}>{notice}</Text> : null}
          <Button title="Join" onPress={() => void submit()} loading={accept.isPending} />
        </Card>
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
  title: {
    ...typeScale.display,
  },
  hint: {
    ...typeScale.small,
  },
  card: {
    gap: spacing.md,
  },
});
