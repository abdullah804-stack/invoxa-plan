import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/** The web build has no native web view; onboarding keeps its native preview. */
export function InvoiceHtmlView({ style }: { html: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.box, { borderColor: colors.border }, style]}>
      <Text style={[styles.text, { color: colors.textMuted }]}>
        The invoice preview opens in the phone app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typeScale.body,
    textAlign: 'center',
  },
});
