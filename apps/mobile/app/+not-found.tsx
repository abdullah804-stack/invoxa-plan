import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>This screen does not exist</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>
          The link may be old. Go back to your dashboard.
        </Text>
        <Button title="Back to home" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  title: {
    ...typeScale.title,
  },
  message: {
    ...typeScale.body,
  },
});
