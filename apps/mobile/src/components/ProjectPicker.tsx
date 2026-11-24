import { formatMoney } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useProjects } from '../api/hooks';
import type { Project } from '../api/types';
import { errorMessage } from '../lib/errors';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface ProjectPickerProps {
  visible: boolean;
  selectedId: string | null;
  /** When a client is chosen, only that client's projects are offered. */
  clientId: string | null;
  onSelect: (project: Project) => void;
  onClose: () => void;
}

/** Pick the project a draft points at, so its tracked time can be billed. */
export function ProjectPicker({
  visible,
  selectedId,
  clientId,
  onSelect,
  onClose,
}: ProjectPickerProps) {
  const { colors } = useTheme();
  const projects = useProjects({
    status: 'active',
    ...(clientId ? { clientId } : {}),
  });
  const rows = projects.data?.projects ?? [];

  return (
    <Sheet visible={visible} title="Choose a project" onClose={onClose}>
      {projects.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : projects.isError ? (
        <View style={styles.centered}>
          <Text style={[styles.message, { color: colors.danger }]}>
            {errorMessage(projects.error)}
          </Text>
          <Button title="Try again" variant="secondary" onPress={() => void projects.refetch()} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.message, { color: colors.textMuted }]}>
            {clientId
              ? 'No active projects for this client yet. Create one under Projects first.'
              : 'No active projects yet. Create one under Projects first.'}
          </Text>
        </View>
      ) : (
        rows.map((project) => {
          const selected = project.id === selectedId;
          return (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(project)}
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
                  {project.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {project.clientName ?? 'No client'}
                  {project.hourlyRateMinor !== null
                    ? ` · ${formatMoney(project.hourlyRateMinor, project.currency)}/hr`
                    : ''}
                </Text>
              </View>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
