import { can, normalizeNameKey } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listClients } from '../../src/api/endpoints';
import { useAiDraft, useCreateDocument } from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { TextField } from '../../src/components/TextField';
import { errorMessage } from '../../src/lib/errors';
import { readSecure, StorageKeys, writeSecure } from '../../src/lib/storage';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

type DocType = 'invoice' | 'estimate' | 'credit_note';
type Consent = 'loading' | 'needs' | 'given';

const TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'credit_note', label: 'Credit' },
];

const EXAMPLES = [
  '3 days of design at 450 for Acme',
  'Logo 800, hosting 120 a month, 10% tax',
  'Consulting 6 hours at 95, 5% discount',
];

function draftUuid(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Type a sentence, get an editable draft. The assistant only suggests lines;
 * this screen creates an ordinary draft and opens the normal editor, so every
 * total, number and due date is still decided by the app and the user.
 */
export default function AiDraftScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const ai = useAiDraft();
  const createDocument = useCreateDocument();

  const [consent, setConsent] = useState<Consent>('loading');
  const [prompt, setPrompt] = useState('');
  const [docType, setDocType] = useState<DocType>('invoice');
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const canUseAi = activeRole ? can(activeRole, 'ai:use') : false;
  const busy = ai.isPending || createDocument.isPending;

  useEffect(() => {
    let active = true;
    void readSecure(StorageKeys.aiConsent).then((value) => {
      if (active) setConsent(value === 'accepted' ? 'given' : 'needs');
    });
    return () => {
      active = false;
    };
  }, []);

  const acceptConsent = () => {
    setConsent('given');
    void writeSecure(StorageKeys.aiConsent, 'accepted');
  };

  const run = async () => {
    setError(null);
    const text = prompt.trim();
    if (text.length < 3) {
      setError('Describe what you are invoicing');
      return;
    }

    try {
      const result = await ai.mutateAsync({ prompt: text, docType });
      setRemaining(result.remaining);
      const draft = result.draft;
      const clientName = draft.clientName?.trim();

      // Reuse an existing client with the same name instead of creating a stray one.
      let clientId: string | undefined;
      if (clientName) {
        try {
          const matches = await listClients({ q: clientName, archived: 'false', limit: 20 });
          const key = normalizeNameKey(clientName);
          clientId = matches.clients.find((client) => normalizeNameKey(client.name) === key)?.id;
        } catch {
          clientId = undefined;
        }
      }

      const created = await createDocument.mutateAsync({
        clientUuid: draftUuid(),
        docType,
        items: draft.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          ...(item.unit ? { unit: item.unit } : {}),
        })),
        currency: draft.currency,
        ...(draft.discount ? { discount: draft.discount } : {}),
        taxRateBp: draft.taxRateBp ?? 0,
        taxMode: draft.taxMode ?? 'added',
        ...(draft.notes ? { notes: draft.notes } : {}),
        ...(clientId ? { clientId } : clientName ? { clientSnapshot: { name: clientName } } : {}),
        source: 'prompt',
      });

      router.replace(`/document/new?id=${created.document.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>Describe it</Text>
            <View style={styles.topSpacer} />
          </View>

          <Text style={[styles.intro, { color: colors.textMuted }]}>
            One sentence becomes a draft with lines, a discount and tax. You can edit everything
            before you issue it.
          </Text>

          {!canUseAi ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Your role cannot use AI drafting. An owner or staff member can.
              </Text>
            </Card>
          ) : consent === 'loading' ? (
            <Card>
              <Text style={[styles.body, { color: colors.textMuted }]}>Loading…</Text>
            </Card>
          ) : consent === 'needs' ? (
            <Card style={styles.consentCard}>
              <Text style={[styles.consentTitle, { color: colors.text }]}>Before you start</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Your description is sent to Google Gemini. On the free tier Google may use prompts
                to improve its products. Invoxa never sends your client list, invoices, addresses or
                emails, and email addresses and links you type are removed before sending.
              </Text>
              <Button title="I understand — continue" onPress={acceptConsent} />
            </Card>
          ) : (
            <>
              <TextField
                label="What are you invoicing?"
                value={prompt}
                onChangeText={setPrompt}
                placeholder="3 days of design at 450 for Acme"
                multiline
                autoFocus
                maxLength={1000}
              />

              <View style={styles.examples}>
                {EXAMPLES.map((example) => (
                  <FilterChip
                    key={example}
                    label={example}
                    selected={false}
                    onPress={() => setPrompt(example)}
                  />
                ))}
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  Document type
                </Text>
                <Segmented
                  options={TYPE_OPTIONS}
                  value={docType}
                  onChange={setDocType}
                  accessibilityLabel="Document type"
                />
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
                  <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                </View>
              ) : null}

              <Button title="Draft it" onPress={() => void run()} loading={busy} />

              {remaining !== null ? (
                <Text style={[styles.footnote, { color: colors.textMuted }]}>
                  {remaining} AI {remaining === 1 ? 'draft' : 'drafts'} left today.
                </Text>
              ) : null}
            </>
          )}

          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            The assistant writes lines and prices only. Totals, tax and numbering stay in Invoxa.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  topSpacer: {
    width: 24,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  intro: {
    ...typeScale.body,
  },
  consentCard: {
    gap: spacing.md,
  },
  consentTitle: {
    ...typeScale.section,
  },
  body: {
    ...typeScale.body,
  },
  examples: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  errorBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    ...typeScale.small,
  },
  footnote: {
    ...typeScale.small,
    textAlign: 'center',
  },
});
