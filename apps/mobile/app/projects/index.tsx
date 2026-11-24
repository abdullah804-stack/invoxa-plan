import { can, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useProjects } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { ProjectStatus } from '../../src/api/types';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

/** Projects group a client's work, its rate, its budget and its tracked time. */
export default function ProjectsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const projects = useProjects();
  const canWrite = activeRole ? can(activeRole, 'clients:write') : false;

  const list = projects.data?.projects ?? [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={projects.isRefetching}
            onRefresh={() => void projects.refetch()}
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
          <Text style={[styles.title, { color: colors.text }]}>Projects</Text>
          {canWrite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New project"
              onPress={() => router.push('/project/new')}
              style={[styles.addButton, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="add" size={20} color={colors.onAccent} />
            </Pressable>
          ) : (
            <View style={styles.topSpacer} />
          )}
        </View>

        {projects.isLoading ? (
          <SkeletonRows rows={3} />
        ) : projects.isError ? (
          <ErrorState
            message={errorMessage(projects.error)}
            onRetry={() => void projects.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title="No projects yet"
            message="A project keeps a client's budget, hourly rate and tracked time together."
            {...(canWrite
              ? { actionTitle: 'New project', onAction: () => router.push('/project/new') }
              : {})}
          />
        ) : (
          list.map((project) => (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityLabel={`${project.name}, ${STATUS_LABELS[project.status]}`}
              onPress={() => router.push(`/project/${project.id}`)}
            >
              <Card style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardText}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                      {project.clientName ?? 'No client'}
                      {project.hourlyRateMinor !== null
                        ? ` · ${formatMoney(project.hourlyRateMinor, project.currency)}/hr`
                        : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          project.status === 'active' ? colors.accentSoft : colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: project.status === 'active' ? colors.accent : colors.textMuted,
                        },
                      ]}
                    >
                      {STATUS_LABELS[project.status]}
                    </Text>
                  </View>
                </View>
                {project.budgetMinor !== null ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    Budget {formatMoney(project.budgetMinor, project.currency)}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))
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
    gap: spacing.md,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 34,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typeScale.small,
  },
});
