import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.dangerSoft
        : variant === 'secondary'
          ? colors.surfaceMuted
          : 'transparent';
  const textColor =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.text
          : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor: variant === 'ghost' ? 'transparent' : background,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        // Two lines so a large accessibility font size wraps instead of cutting
        // the action's name off.
        <Text style={[styles.label, { color: textColor }]} numberOfLines={2}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  label: {
    ...typeScale.bodyStrong,
    textAlign: 'center',
  },
});
