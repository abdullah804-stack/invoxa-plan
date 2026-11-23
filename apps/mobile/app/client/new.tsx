import { clientInputSchema } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useClientDetail, useCreateClient, useUpdateClient } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { zodFieldErrors } from '../../src/lib/validation';
import { spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Create or edit one client. The shared schema is the only validation rule. */
export default function ClientFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' && params.id ? params.id : undefined;

  const existing = useClientDetail(editingId);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const client = existing.data?.client;
    if (!client || hydrated) return;
    setName(client.name);
    setEmail(client.email ?? '');
    setPhone(client.phone ?? '');
    setAddress(client.address ?? '');
    setTaxId(client.taxId ?? '');
    setNotes(client.notes ?? '');
    setHydrated(true);
  }, [existing.data, hydrated]);

  const busy = createClient.isPending || updateClient.isPending;

  const save = async () => {
    setFormError(null);
    const parsed = clientInputSchema.safeParse({
      name,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      if (editingId) {
        await updateClient.mutateAsync({ id: editingId, input: parsed.data });
      } else {
        await createClient.mutateAsync(parsed.data);
      }
      router.back();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  if (editingId && existing.isLoading && !hydrated) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

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
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>
              {editingId ? 'Edit client' : 'New client'}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Acme Trading"
            autoCapitalize="words"
            error={errors['name']}
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="accounts@acme.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={errors['email']}
          />
          <TextField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 0100"
            keyboardType="phone-pad"
            error={errors['phone']}
          />
          <TextField
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Street, city, country"
            multiline
            error={errors['address']}
          />
          <TextField
            label="Tax ID"
            value={taxId}
            onChangeText={setTaxId}
            placeholder="Optional"
            autoCapitalize="characters"
            error={errors['taxId']}
          />
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything you want to remember"
            multiline
            error={errors['notes']}
          />

          {formError ? (
            <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text>
          ) : null}

          <Button
            title={editingId ? 'Save changes' : 'Add client'}
            onPress={() => void save()}
            loading={busy}
          />
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
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerSpacer: {
    width: 24,
  },
  title: {
    ...typeScale.title,
    flex: 1,
    textAlign: 'center',
  },
  formError: {
    ...typeScale.small,
  },
});
