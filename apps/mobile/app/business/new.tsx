import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useCreateBusiness } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function NewBusinessScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshBusinesses } = useSession();
  const createBusiness = useCreateBusiness();

  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNotice('Add a business name');
      return;
    }

    setNotice(null);
    try {
      const result = await createBusiness.mutateAsync({ name: trimmed });
      await refreshBusinesses(result.business.id);
      router.replace('/');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>New business</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          It starts empty, with its own invoice numbers. You are its owner, and you can invite
          people once it exists.
        </Text>

        <Card style={styles.card}>
          <TextField
            label="Business name"
            value={name}
            onChangeText={setName}
            placeholder="Second Shop Ltd"
            autoCapitalize="words"
            maxLength={200}
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Set its currency, tax, brand and invoice language from Settings while it is active.
          </Text>
          {notice ? <Text style={[styles.hint, { color: colors.danger }]}>{notice}</Text> : null}
          <Button
            title="Create business"
            onPress={() => void submit()}
            loading={createBusiness.isPending}
          />
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
