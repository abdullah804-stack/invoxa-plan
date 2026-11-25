import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useActivityPages } from '../src/api/hooks';
import { useSession } from '../src/auth/SessionProvider';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { SkeletonRows } from '../src/components/Skeleton';
import { EmptyState, ErrorState } from '../src/components/States';
import { errorMessage } from '../src/lib/errors';
import { radius, spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

function when(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Who did what, newest first. The log keeps the newest 250 entries. */
export default function ActivityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const allowed = activeRole ? can(activeRole, 'activity:read') : false;
  const activity = useActivityPages(allowed);

  const entries = activity.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={activity.isRefetching}
            onRefresh={() => void activity.refetch()}
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
          <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
          <View style={styles.topSpacer} />
        </View>

        {!allowed ? (
          <EmptyState
            title="Owners and staff see the log"
            message="A viewer cannot read who changed what. Ask an owner for a staff seat."
          />
        ) : activity.isLoading ? (
          <SkeletonRows rows={4} />
        ) : activity.isError ? (
          <ErrorState
            message={errorMessage(activity.error)}
            onRetry={() => void activity.refetch()}
          />
        ) : entries.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            message="Issuing an invoice, taking a payment or adding a client shows up here."
          />
        ) : (
          <>
            {entries.map((entry) => (
              <Card key={entry.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={[styles.summary, { color: colors.text }]}>{entry.summary}</Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>
                    {when(entry.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {entry.actorName} · {entry.actorRole}
                </Text>
              </Card>
            ))}

            {activity.hasNextPage ? (
              <Button
                title={activity.isFetchingNextPage ? 'Loading…' : 'Load older'}
                variant="secondary"
                onPress={() => void activity.fetchNextPage()}
                loading={activity.isFetchingNextPage}
              />
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
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 24,
  },
  row: {
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  summary: {
    ...typeScale.bodyStrong,
    flex: 1,
  },
  time: {
    ...typeScale.tiny,
  },
  meta: {
    ...typeScale.small,
  },
});
