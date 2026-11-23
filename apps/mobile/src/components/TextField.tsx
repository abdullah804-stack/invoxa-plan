import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
}

export function TextField({ label, value, onChangeText, error, hint, ...rest }: TextFieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
          },
          rest.multiline ? styles.multiline : null,
        ]}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
      />
      {error ? (
        <Text style={[styles.help, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.help, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    ...typeScale.small,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typeScale.body,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  help: {
    ...typeScale.small,
  },
});
