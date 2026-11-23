import { STATUS_LABELS, type ShownStatus } from '@invoxa/shared';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, statusTone, typeScale, type Palette } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

function toneColors(colors: Palette, status: ShownStatus): { background: string; text: string } {
  switch (statusTone(status)) {
    case 'accent':
      return { background: colors.accentSoft, text: colors.accent };
    case 'success':
      return { background: colors.successSoft, text: colors.success };
    case 'warning':
      return { background: colors.warningSoft, text: colors.warning };
    case 'danger':
      return { background: colors.dangerSoft, text: colors.danger };
    default:
      return { background: colors.surfaceMuted, text: colors.textMuted };
  }
}

export function StatusPill({ status }: { status: ShownStatus }) {
  const { colors } = useTheme();
  const tone = toneColors(colors, status);

  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <Text style={[styles.label, { color: tone.text }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
