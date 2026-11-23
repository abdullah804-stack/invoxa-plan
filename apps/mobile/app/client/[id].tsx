import { can, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useClientDetail, useDeleteClient, useUpdateClient } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { DocumentRow } from '../../src/components/DocumentRow';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ClientDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const detail = useClientDetail(id);
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const [notice, setNotice] = useState<string | null>(null);

  const canWrite = activeRole ? can(activeRole, 'clients:write') : false;
  const client = detail.data?.client;
  const currencies = detail.data?.currencies ?? [];
  const documents = detail.data?.documents ?? [];

  const contactRows = client
    ? [
        { label: 'Email', value: client.email },
        { label: 'Phone', value: client.phone },
        { label: 'Address', value: client.address },
        { label: 'Tax ID', value: client.taxId },
      ].filter((row): row is { label: string; value: string } => Boolean(row.value))
    : [];

  const confirmDelete = () => {
    if (!client) return;
    Alert.alert(
      'Delete client',
      'Clients with issued documents are archived instead, so those invoices keep their name.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteClient.mutate(client.id, {
              onSuccess: (result) => {
                if (result && result.archived) {
                  setNotice('Client archived, because issued documents still reference them.');
                  void detail.refetch();
                } else {
                  router.back();
                }
              },
              onError: (error) => setNotice(errorMessage(error)),
            });
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching}
            onRefresh={() => void detail.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          {canWrite && client ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit client"
              onPress={() => router.push(`/client/new?id=${client.id}`)}
              hitSlop={12}
            >
              <Text style={[styles.editLabel, { color: colors.accent }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.editSpacer} />
          )}
        </View>

        {detail.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={30} width="60%" />
            <Skeleton height={100} />
            <Skeleton height={140} />
          </View>
        ) : detail.isError ? (
          <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
        ) : !client ? (
          <EmptyState title="Client not found" message="This client may have been deleted." />
        ) : (
          <>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text }]}>{client.name}</Text>
              {client.archived ? (
                <Text style={[styles.archived, { color: colors.warning }]}>Archived</Text>
              ) : null}
            </View>

            {notice ? (
              <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.noticeText, { color: colors.accent }]}>{notice}</Text>
              </View>
            ) : null}

            {contactRows.length > 0 || client.notes ? (
              <Card style={styles.card}>
                {contactRows.map((row) => (
                  <View key={row.label} style={styles.contactRow}>
                    <Text style={[styles.contactLabel, { color: colors.textMuted }]}>
                      {row.label}
                    </Text>
                    <Text style={[styles.contactValue, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))}
                {client.notes ? (
                  <View style={styles.contactRow}>
                    <Text style={[styles.contactLabel, { color: colors.textMuted }]}>Notes</Text>
                    <Text style={[styles.contactValue, { color: colors.text }]}>
                      {client.notes}
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {currencies.length === 0 ? (
              <Card style={styles.card}>
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  No issued documents for this client yet. Totals appear here once an invoice is
                  issued.
                </Text>
              </Card>
            ) : (
              currencies.map((currency) => (
                <Card key={currency.currency} style={styles.card}>
                  <Text style={[styles.caption, { color: colors.textMuted }]}>
                    Outstanding · {currency.currency}
                  </Text>
                  <Text style={[styles.outstanding, { color: colors.text }]}>
                    {formatMoney(currency.outstanding, currency.currency)}
                  </Text>
                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.stat}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Billed</Text>
                      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                        {formatMoney(currency.billed, currency.currency)}
                      </Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Paid</Text>
                      <Text style={[styles.statValue, { color: colors.success }]} numberOfLines={1}>
                        {formatMoney(currency.paid, currency.currency)}
                      </Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Overdue</Text>
                      <Text
                        style={[
                          styles.statValue,
                          { color: currency.overdue > 0 ? colors.danger : colors.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {formatMoney(currency.overdue, currency.currency)}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
              {documents.length === 0 ? (
                <Card>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    Nothing yet for this client.
                  </Text>
                </Card>
              ) : (
                <Card style={styles.listCard}>
                  {documents.map((document, index) => (
                    <View
                      key={document.id}
                      style={[
                        index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                      ]}
                    >
                      <DocumentRow
                        document={document}
                        onPress={() => router.push(`/document/${document.id}`)}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </View>

            {canWrite ? (
              <View style={styles.actions}>
                <Button
                  title="New document for this client"
                  onPress={() =>
                    router.push(
                      `/document/new?clientId=${client.id}&clientName=${encodeURIComponent(client.name)}`,
                    )
                  }
                />
                <Button
                  title={client.archived ? 'Restore client' : 'Archive client'}
                  variant="secondary"
                  loading={updateClient.isPending}
                  onPress={() => {
                    updateClient.mutate(
                      { id: client.id, input: { archived: !client.archived } },
                      {
                        onSuccess: () => {
                          setNotice(
                            client.archived ? 'Client restored.' : 'Client archived. History kept.',
                          );
                        },
                        onError: (error) => setNotice(errorMessage(error)),
                      },
                    );
                  }}
                />
                <Button
                  title="Delete client"
                  variant="danger"
                  loading={deleteClient.isPending}
                  onPress={confirmDelete}
                />
              </View>
            ) : null}

            {detail.isRefetching ? (
              <ActivityIndicator color={colors.accent} style={styles.refetching} />
            ) : null}
          </>
        )}
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
  },
  editLabel: {
    ...typeScale.bodyStrong,
  },
  editSpacer: {
    width: 24,
  },
  loading: {
    gap: spacing.md,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  title: {
    ...typeScale.display,
  },
  archived: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typeScale.small,
  },
  card: {
    gap: spacing.xs,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  contactLabel: {
    ...typeScale.small,
    width: 74,
  },
  contactValue: {
    ...typeScale.body,
    flex: 1,
  },
  caption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  outstanding: {
    ...typeScale.money,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    ...typeScale.bodyStrong,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.section,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  separator: {
    borderTopWidth: 1,
  },
  muted: {
    ...typeScale.body,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  refetching: {
    marginTop: spacing.sm,
  },
});
