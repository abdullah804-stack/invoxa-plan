import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useClients } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { Client } from '../../src/api/types';

type ArchivedFilter = 'false' | 'true' | 'all';

const ARCHIVE_OPTIONS: { value: ArchivedFilter; label: string }[] = [
  { value: 'false', label: 'Active' },
  { value: 'true', label: 'Archived' },
  { value: 'all', label: 'All' },
];

function ClientRow({ client, onPress }: { client: Client; onPress: () => void }) {
  const { colors } = useTheme();
  const contact = [client.email, client.phone].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${client.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {client.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {contact || 'No contact details'}
        </Text>
      </View>
      {client.archived ? (
        <Text style={[styles.archived, { color: colors.textMuted }]}>Archived</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function ClientsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState<ArchivedFilter>('false');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(
    () => ({ ...(query ? { q: query } : {}), archived, limit: 100 }),
    [query, archived],
  );
  const clients = useClients(params);
  const rows = clients.data?.clients ?? [];
  const canWrite = activeRole ? can(activeRole, 'clients:write') : false;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Clients</Text>
          {canWrite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a client"
              onPress={() => router.push('/client/new')}
              style={[styles.addButton, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="add" size={18} color={colors.onAccent} />
              <Text style={[styles.addLabel, { color: colors.onAccent }]}>Add</Text>
            </Pressable>
          ) : null}
        </View>

        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search clients"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        <View style={styles.chips}>
          {ARCHIVE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={archived === option.value}
              onPress={() => setArchived(option.value)}
            />
          ))}
        </View>
      </View>

      {clients.isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonRows rows={6} />
        </View>
      ) : clients.isError ? (
        <View style={styles.listPadding}>
          <ErrorState
            message={errorMessage(clients.error)}
            onRetry={() => void clients.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(client) => client.id}
          contentContainerStyle={[styles.listContent, rows.length === 0 ? styles.listEmpty : null]}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          refreshControl={
            <RefreshControl
              refreshing={clients.isRefetching}
              onRefresh={() => void clients.refetch()}
              tintColor={colors.textMuted}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={query ? 'No matches' : 'No clients yet'}
              message={
                query
                  ? 'Try a different name.'
                  : 'Add the people you invoice once, then pick them on every document.'
              }
              {...(canWrite && !query
                ? { actionTitle: 'Add a client', onAction: () => router.push('/client/new') }
                : {})}
            />
          }
          renderItem={({ item }) => (
            <ClientRow client={item} onPress={() => router.push(`/client/${item.id}`)} />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typeScale.display,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addLabel: {
    ...typeScale.small,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listPadding: {
    paddingHorizontal: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  gap: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  archived: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
