import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What the server stores',
    body: 'Your account (name, email, password hash), your businesses and the records you create: clients, invoices, estimates, credit notes, payments, expenses, projects, tracked time, saved items and the activity log. Nothing is sold or shared for advertising.',
  },
  {
    title: 'AI and Gemini',
    body: 'When you use Describe it or scan a receipt, the sentence you type (or dictate) or the receipt photo is sent to Google Gemini to turn it into fields. The receipt photo is never stored by Invoxa or written to a log; it is used for that one request and discarded. Google processes the request under its own terms. Invoices and PDFs are built on your phone and are never sent to an AI model.',
  },
  {
    title: 'What stays on this phone',
    body: 'Your signed-in session, the invoice and estimate PDFs you print or share, the reminder notifications you schedule, draft edits kept for offline use, and your app-lock setting. The app lock uses your phone’s fingerprint or face; Invoxa never sees that data.',
  },
  {
    title: 'How long things are kept',
    body: 'Invoices, clients and expenses stay until you delete them. The activity log keeps the newest 250 entries per business. AI daily-usage counters are deleted after 30 days. Deleted drafts are removed straight away; issued documents are voided so numbers are never reused.',
  },
  {
    title: 'Getting your data out, or deleting it',
    body: 'Backup writes a JSON copy of the active business that you can share and restore later. Delete account removes your account and every business you solely own, with its clients, documents, receipts and log. If other people still work in a business you own, transfer ownership or remove them first.',
  },
  {
    title: 'What Invoxa does not do',
    body: 'No email is sent from the API, no payment is taken online, and no invoice leaves your phone unless you share it yourself. Reminders are local notifications; nothing is pushed from a server.',
  },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Privacy</Text>
          <View style={styles.topSpacer} />
        </View>

        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Plain words about what Invoxa keeps, where it goes and how to get rid of it. This screen
          is a summary, not a legal contract.
        </Text>

        {SECTIONS.map((section) => (
          <Card key={section.title} style={styles.card}>
            <Text style={[styles.heading, { color: colors.text }]}>{section.title}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{section.body}</Text>
          </Card>
        ))}
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
    width: 24,
  },
  intro: {
    ...typeScale.small,
  },
  card: {
    gap: spacing.sm,
  },
  heading: {
    ...typeScale.bodyStrong,
  },
  body: {
    ...typeScale.body,
  },
});
