import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionTitle, onAction }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.box, { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      <Button title="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  mark: {
    width: 36,
    height: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.section,
  },
  message: {
    ...typeScale.body,
  },
  action: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
  },
});
