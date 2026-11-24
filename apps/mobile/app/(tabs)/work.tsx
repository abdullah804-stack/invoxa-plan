import { can, formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useDiscardTimer,
  useProjects,
  useStartTimer,
  useStopTimer,
  useTimer,
} from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ProjectPicker } from '../../src/components/ProjectPicker';
import { Screen } from '../../src/components/Screen';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { formatMinutes } from '../../src/lib/time';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Work: the running timer and the projects it bills against. One timer per
 * person lives on the server, so a closed app never loses the start time.
 */
export default function WorkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();

  const timer = useTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const discard = useDiscardTimer();
  const projects = useProjects({ status: 'active' });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const canSeeProjects = activeRole ? can(activeRole, 'projects:read') : false;
  const canWriteTime = activeRole ? can(activeRole, 'time:write') : false;
  const canWriteProjects = activeRole ? can(activeRole, 'clients:write') : false;

  const running = timer.data?.timer ?? null;
  const rows = projects.data?.projects ?? [];

  const begin = () => {
    if (!projectId) return;
    setNotice(null);
    start.mutate(
      { projectId, ...(description.trim() ? { description: description.trim() } : {}) },
      {
        onSuccess: () => {
          setProjectId(null);
          setProjectName('');
          setDescription('');
        },
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  };

  const finish = () => {
    setNotice(null);
    stop.mutate(undefined, {
      onSuccess: (result) =>
        setNotice(
          `Saved ${formatMinutes(result.minutes)} to ${running?.projectName ?? 'the project'}.`,
        ),
      onError: (error) => setNotice(errorMessage(error)),
    });
  };

  const drop = () => {
    setNotice(null);
    discard.mutate(undefined, {
      onSuccess: () => setNotice('Timer discarded. No time was recorded.'),
      onError: (error) => setNotice(errorMessage(error)),
    });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={timer.isRefetching || projects.isRefetching}
            onRefresh={() => {
              void timer.refetch();
              void projects.refetch();
            }}
            tintColor={colors.textMuted}
          />
        }
      >
        <Text style={[styles.title, { color: colors.text }]}>Work</Text>

        <Card style={styles.timerCard}>
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            {running ? 'Timer running' : 'Start a timer'}
          </Text>

          {running ? (
            <>
              <Text style={[styles.timerProject, { color: colors.text }]}>
                {running.projectName}
              </Text>
              {running.description ? (
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {running.description}
                </Text>
              ) : null}
              <Text style={[styles.elapsed, { color: colors.accent }]}>
                {formatMinutes(running.elapsedMinutes)}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Since {new Date(running.startedAt).toLocaleTimeString()}. Stopping banks the time on
                the project.
              </Text>
              {canWriteTime ? (
                <View style={styles.actions}>
                  <Button title="Stop and save" onPress={finish} loading={stop.isPending} />
                  <Button
                    title="Discard"
                    variant="ghost"
                    onPress={drop}
                    loading={discard.isPending}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a project to time"
                onPress={() => setPickerOpen(true)}
                style={[styles.projectRow, { borderColor: colors.border }]}
              >
                <View style={styles.projectText}>
                  <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                    {projectName || 'Choose a project'}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {projectName ? 'Tap to change' : 'Time is saved against it'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

              <TextField
                label="What are you working on? (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="Drafting the homepage"
                maxLength={500}
              />

              {canWriteTime ? (
                <Button
                  title="Start timer"
                  onPress={begin}
                  loading={start.isPending}
                  disabled={!projectId}
                />
              ) : null}
            </>
          )}

          {notice ? <Text style={[styles.meta, { color: colors.textMuted }]}>{notice}</Text> : null}
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Projects</Text>
          {canWriteProjects ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New project"
              onPress={() => router.push('/project/new')}
              hitSlop={8}
            >
              <Text style={[styles.link, { color: colors.accent }]}>New project</Text>
            </Pressable>
          ) : null}
        </View>

        {!canSeeProjects ? (
          <EmptyState
            title="No access"
            message="Ask an owner for a role that can see projects and tracked time."
          />
        ) : projects.isLoading ? (
          <SkeletonRows rows={4} />
        ) : projects.isError ? (
          <ErrorState
            message={errorMessage(projects.error)}
            onRetry={() => void projects.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No active projects"
            message="Create a project to track hours and bill them."
            {...(canWriteProjects
              ? { actionTitle: 'New project', onAction: () => router.push('/project/new') }
              : {})}
          />
        ) : (
          <Card style={styles.listCard}>
            {rows.map((project, index) => (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${project.name}`}
                onPress={() => router.push(`/project/${project.id}`)}
                style={[
                  styles.row,
                  index > 0 ? [styles.separator, { borderTopColor: colors.border }] : null,
                ]}
              >
                <View style={styles.projectText}>
                  <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {project.clientName ?? 'No client'}
                    {project.hourlyRateMinor !== null
                      ? ` · ${formatMoney(project.hourlyRateMinor, project.currency)}/hr`
                      : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </Card>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All projects"
          onPress={() => router.push('/projects')}
          style={[styles.allRow, { borderColor: colors.border }]}
        >
          <Text style={[styles.link, { color: colors.accent }]}>
            All projects, including archived
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Pressable>
      </ScrollView>

      <ProjectPicker
        visible={pickerOpen}
        selectedId={projectId}
        clientId={null}
        onClose={() => setPickerOpen(false)}
        onSelect={(project) => {
          setProjectId(project.id);
          setProjectName(project.name);
          setPickerOpen(false);
        }}
      />
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
    ...typeScale.title,
  },
  timerCard: {
    gap: spacing.sm,
  },
  caption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timerProject: {
    ...typeScale.section,
  },
  elapsed: {
    ...typeScale.display,
  },
  meta: {
    ...typeScale.small,
  },
  actions: {
    gap: spacing.xs,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  projectText: {
    flex: 1,
    gap: 2,
  },
  projectName: {
    ...typeScale.bodyStrong,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  link: {
    ...typeScale.small,
  },
  listCard: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
