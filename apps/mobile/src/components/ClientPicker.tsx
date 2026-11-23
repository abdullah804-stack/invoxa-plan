import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useClients } from '../api/hooks';
import type { Client } from '../api/types';
import { errorMessage } from '../lib/errors';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface ClientPickerProps {
  visible: boolean;
  selectedId: string | null;
  onSelect: (client: Client) => void;
  onClose: () => void;
  onCreate: () => void;
}

/** Search the client book and pick one for a document. */
export function ClientPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
  onCreate,
}: ClientPickerProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const clients = useClients({
    ...(query ? { q: query } : {}),
    archived: 'false',
    limit: 100,
  });
  const rows = clients.data?.clients ?? [];

  return (
    <Sheet visible={visible} title="Choose a client" onClose={onClose}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search clients"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.search,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
        accessibilityLabel="Search clients"
      />

      {clients.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : clients.isError ? (
        <View style={styles.centered}>
          <Text style={[styles.message, { color: colors.danger }]}>
            {errorMessage(clients.error)}
          </Text>
          <Button title="Try again" variant="secondary" onPress={() => void clients.refetch()} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.message, { color: colors.textMuted }]}>
            {query
              ? 'No client matches that search.'
              : 'No clients yet. Add one and it stays in your book.'}
          </Text>
        </View>
      ) : (
        rows.map((client) => {
          const selected = client.id === selectedId;
          return (
            <Pressable
              key={client.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(client)}
              style={[
                styles.row,
                {
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {client.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {client.email ?? client.phone ?? 'No contact details'}
                </Text>
              </View>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        })
      )}

      <Button title="Add a new client" variant="secondary" onPress={onCreate} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    ...typeScale.body,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  message: {
    ...typeScale.body,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
});
