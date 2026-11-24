import {
  can,
  canTransition,
  computeTotals,
  DOCUMENT_TITLES,
  formatDate,
  formatMoney,
  lateFeeAmount,
  type StoredDocumentStatus,
} from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useApplyLateFee,
  useDeleteDocument,
  useDocument,
  useDuplicateDocument,
  useIssueDocument,
  useProfile,
  useRecordPayment,
  useSetDocumentStatus,
} from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { FilterChip } from '../../src/components/FilterChip';
import { Screen } from '../../src/components/Screen';
import { Sheet } from '../../src/components/Sheet';
import { Skeleton } from '../../src/components/Skeleton';
import { StatusPill } from '../../src/components/StatusPill';
import { TextField } from '../../src/components/TextField';
import { TotalsBlock } from '../../src/components/TotalsBlock';
import { errorMessage } from '../../src/lib/errors';
import type { PaymentMethod } from '../../src/api/types';
import { amountToInput, parseAmountToMinor } from '../../src/lib/money';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METHODS.map((method) => [method.value, method.label]),
);

export default function DocumentDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const documentQuery = useDocument(id);
  const issue = useIssueDocument();
  const recordPayment = useRecordPayment();
  const statusChange = useSetDocumentStatus();
  const duplicate = useDuplicateDocument();
  const removeDocument = useDeleteDocument();
  const applyLateFee = useApplyLateFee();
  const profile = useProfile();
  const lateFeeRule = profile.data?.business.lateFee;

  const [notice, setNotice] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  const document = documentQuery.data?.document;
  const status = document?.status;

  const canRecordPayment = activeRole ? can(activeRole, 'payments:write') : false;
  const canIssue = activeRole ? can(activeRole, 'documents:issue') : false;
  const canDuplicate = activeRole ? can(activeRole, 'documents:duplicate') : false;
  const canVoid = activeRole ? can(activeRole, 'documents:void') : false;
  const canEdit = activeRole ? can(activeRole, 'drafts:create') : false;
  const canApplyLateFee = activeRole ? can(activeRole, 'lateFee:apply') : false;

  // Line nets come from the same shared totals function the server uses.
  const lineNets = useMemo(() => {
    if (!document) return [];
    try {
      return computeTotals({
        items: document.items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountBp: item.discountBp ?? 0,
        })),
        discount: document.discount,
        taxRateBp: document.taxRateBp,
        taxMode: document.taxMode,
      }).lines;
    } catch {
      return [];
    }
  }, [document]);

  const hasLateFee = Boolean(
    document?.adjustments.some((adjustment) => adjustment.type === 'late_fee'),
  );
  const lateFeePreview =
    document && lateFeeRule
      ? lateFeeAmount({ type: lateFeeRule.type, value: lateFeeRule.value }, document.totals.balance)
      : 0;

  const addLateFee = () => {
    if (!document) return;
    Alert.alert(
      'Add a late fee?',
      `${formatMoney(lateFeePreview, document.currency)} will be added to what the client owes. This can only be done once.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add fee',
          onPress: () =>
            applyLateFee.mutate(document.id, {
              onSuccess: (result) =>
                setNotice(`Late fee of ${formatMoney(result.amount, document.currency)} added.`),
              onError: (error) => setNotice(errorMessage(error)),
            }),
        },
      ],
    );
  };

  const openPayment = () => {
    if (!document) return;
    setAmount(amountToInput(document.totals.balance, document.currency));
    setMethod('bank_transfer');
    setReference('');
    setNote('');
    setAmountError(null);
    setPaymentOpen(true);
  };

  const submitPayment = () => {
    if (!document) return;
    const minor = parseAmountToMinor(amount, document.currency);
    if (minor === null || minor <= 0) {
      setAmountError('Enter an amount greater than zero');
      return;
    }
    if (minor > document.totals.balance) {
      setAmountError('That is more than the balance due');
      return;
    }
    setAmountError(null);
    recordPayment.mutate(
      {
        id: document.id,
        input: {
          amount: minor,
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          setPaymentOpen(false);
          setNotice('Payment recorded.');
        },
        onError: (error) => setAmountError(errorMessage(error)),
      },
    );
  };

  const changeStatus = (next: 'sent' | 'paid' | 'void', message: string) => {
    if (!document) return;
    statusChange.mutate(
      { id: document.id, status: next },
      {
        onSuccess: () => setNotice(message),
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  };

  const confirmVoid = () => {
    Alert.alert(
      'Void this document?',
      'A void document keeps its number and stays in your records. It cannot be unvoided.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void',
          style: 'destructive',
          onPress: () => changeStatus('void', 'Document voided. Its number is never reused.'),
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!document) return;
    Alert.alert('Delete draft?', 'Drafts are the only documents that can be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeDocument.mutate(document.id, {
            onSuccess: () => router.back(),
            onError: (error) => setNotice(errorMessage(error)),
          });
        },
      },
    ]);
  };

  const duplicateDocument = () => {
    if (!document) return;
    duplicate.mutate(document.id, {
      onSuccess: (result) => router.push(`/document/${result.document.id}`),
      onError: (error) => setNotice(errorMessage(error)),
    });
  };

  const issueDocument = () => {
    if (!document) return;
    issue.mutate(
      { id: document.id, ...(document.dueDate ? { dueDate: document.dueDate } : {}) },
      {
        onSuccess: (result) =>
          setNotice(`Issued as ${result.document.number ?? 'a numbered document'}.`),
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  };

  const canShow = (from: StoredDocumentStatus | undefined, to: 'sent' | 'paid' | 'void') =>
    from ? canTransition(from, to) : false;

  const subtotalLine = (index: number) => {
    const line = lineNets[index];
    if (!line) return '';
    const quantity = String(line.quantity);
    return `${quantity} × ${formatMoney(line.unitPrice, document?.currency ?? 'USD')}`;
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={documentQuery.isRefetching}
            onRefresh={() => void documentQuery.refetch()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/invoices'))}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          {document && canEdit && document.status === 'draft' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit draft"
              onPress={() => router.push(`/document/new?id=${document.id}`)}
              hitSlop={12}
            >
              <Text style={[styles.editLabel, { color: colors.accent }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.topSpacer} />
          )}
        </View>

        {documentQuery.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={28} width="55%" />
            <Skeleton height={96} />
            <Skeleton height={180} />
          </View>
        ) : documentQuery.isError ? (
          <Card>
            <Text style={[styles.muted, { color: colors.danger }]}>
              {errorMessage(documentQuery.error)}
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => void documentQuery.refetch()}
              style={styles.retry}
            />
          </Card>
        ) : !document ? (
          <Card>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              This document could not be found.
            </Text>
          </Card>
        ) : (
          <>
            <View style={styles.titleBlock}>
              <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
                {DOCUMENT_TITLES[document.docType]}
              </Text>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {document.number ?? 'Draft'}
                </Text>
                <StatusPill status={document.shownStatus} />
              </View>
            </View>

            {notice ? (
              <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.noticeText, { color: colors.accent }]}>{notice}</Text>
              </View>
            ) : null}

            <Card style={styles.card}>
              <Text style={[styles.caption, { color: colors.textMuted }]}>Bill to</Text>
              <Text style={[styles.clientName, { color: colors.text }]}>
                {document.clientSnapshot?.name ?? document.clientName ?? 'No client'}
              </Text>
              {document.clientSnapshot?.email ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {document.clientSnapshot.email}
                </Text>
              ) : null}
              {document.clientSnapshot?.address ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  {document.clientSnapshot.address}
                </Text>
              ) : null}
              {document.clientId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open client"
                  onPress={() => router.push(`/client/${document.clientId}`)}
                  style={styles.clientLink}
                  hitSlop={8}
                >
                  <Text style={[styles.link, { color: colors.accent }]}>Open client</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </Pressable>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <View style={styles.metaRow}>
                <View style={styles.meta}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Issued</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {document.issueDate ? formatDate(document.issueDate) : 'Not issued'}
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
                    {document.docType === 'estimate' ? 'Valid until' : 'Due'}
                  </Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {document.docType === 'estimate'
                      ? document.validUntil
                        ? formatDate(document.validUntil)
                        : '—'
                      : document.dueDate
                        ? formatDate(document.dueDate)
                        : '—'}
                  </Text>
                </View>
              </View>
              {document.reference ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  Reference {document.reference}
                </Text>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <Text style={[styles.caption, { color: colors.textMuted }]}>Lines</Text>
              {document.items.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  No lines on this document.
                </Text>
              ) : (
                document.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.line,
                      { borderTopColor: colors.border },
                      index === 0 ? styles.firstLine : null,
                    ]}
                  >
                    <View style={styles.lineText}>
                      <Text style={[styles.lineDescription, { color: colors.text }]}>
                        {item.description}
                      </Text>
                      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
                        {subtotalLine(index)}
                        {item.discountBp ? ` · ${item.discountBp / 100}% off` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.lineAmount, { color: colors.text }]}>
                      {formatMoney(lineNets[index]?.net ?? 0, document.currency)}
                    </Text>
                  </View>
                ))
              )}

              <View style={[styles.totalsSpacer, { borderTopColor: colors.border }]}>
                <TotalsBlock
                  totals={document.totals}
                  currency={document.currency}
                  taxMode={document.taxMode}
                />
              </View>
            </Card>

            {document.payments.length > 0 ? (
              <Card style={styles.card}>
                <Text style={[styles.caption, { color: colors.textMuted }]}>Payments</Text>
                {document.payments.map((payment) => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View style={styles.lineText}>
                      <Text style={[styles.lineDescription, { color: colors.text }]}>
                        {formatMoney(payment.amount, document.currency)}
                      </Text>
                      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
                        {METHOD_LABELS[payment.method] ?? payment.method} ·{' '}
                        {formatDate(payment.paidAt.slice(0, 10))}
                        {payment.reference ? ` · ${payment.reference}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {document.notes || document.terms ? (
              <Card style={styles.card}>
                {document.notes ? (
                  <>
                    <Text style={[styles.caption, { color: colors.textMuted }]}>Notes</Text>
                    <Text style={[styles.body, { color: colors.text }]}>{document.notes}</Text>
                  </>
                ) : null}
                {document.terms ? (
                  <>
                    <Text style={[styles.caption, { color: colors.textMuted }]}>Terms</Text>
                    <Text style={[styles.body, { color: colors.text }]}>{document.terms}</Text>
                  </>
                ) : null}
              </Card>
            ) : null}

            <View style={styles.actions}>
              {status === 'sent' &&
              document.docType === 'invoice' &&
              canApplyLateFee &&
              lateFeeRule?.enabled &&
              !hasLateFee &&
              document.totals.balance > 0 ? (
                <Button
                  title={`Add late fee (${formatMoney(lateFeePreview, document.currency)})`}
                  variant="secondary"
                  onPress={addLateFee}
                  loading={applyLateFee.isPending}
                />
              ) : null}

              {status === 'draft' && canIssue ? (
                <Button title="Issue document" onPress={issueDocument} loading={issue.isPending} />
              ) : null}

              {status === 'draft' && canEdit ? (
                <Button
                  title="Edit draft"
                  variant="secondary"
                  onPress={() => router.push(`/document/new?id=${document.id}`)}
                />
              ) : null}

              {canShow(status, 'paid') && document.totals.balance > 0 && canRecordPayment ? (
                <>
                  <Button title="Record payment" onPress={openPayment} />
                  <Button
                    title="Mark paid"
                    variant="secondary"
                    onPress={() => changeStatus('paid', 'Marked paid.')}
                    loading={statusChange.isPending}
                  />
                </>
              ) : null}

              {canShow(status, 'sent') && canRecordPayment ? (
                <Button
                  title="Undo mark paid"
                  variant="secondary"
                  onPress={() => changeStatus('sent', 'Back to sent.')}
                  loading={statusChange.isPending}
                />
              ) : null}

              {canShow(status, 'void') && canVoid ? (
                <Button
                  title="Void document"
                  variant="danger"
                  onPress={confirmVoid}
                  loading={statusChange.isPending}
                />
              ) : null}

              <Button
                title="Preview and share PDF"
                variant="secondary"
                onPress={() => router.push(`/document/preview?id=${document.id}`)}
              />

              {canDuplicate ? (
                <Button
                  title="Duplicate"
                  variant="secondary"
                  onPress={duplicateDocument}
                  loading={duplicate.isPending}
                />
              ) : null}

              {document.docType === 'invoice' && canEdit ? (
                <Button
                  title="Repeat this invoice"
                  variant="secondary"
                  onPress={() => router.push(`/recurring/new?documentId=${document.id}`)}
                />
              ) : null}

              {status === 'draft' ? (
                <Button
                  title="Delete draft"
                  variant="ghost"
                  onPress={confirmDelete}
                  loading={removeDocument.isPending}
                />
              ) : null}
            </View>

            {status === 'void' ? (
              <Text style={[styles.footerHint, { color: colors.textMuted }]}>
                This document is void. Its number stays used so numbers never repeat.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={paymentOpen} title="Record payment" onClose={() => setPaymentOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetBody}>
            <TextField
              label={`Amount (${document?.currency ?? ''})`}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              error={amountError ?? undefined}
              hint={
                document
                  ? `Balance due ${formatMoney(document.totals.balance, document.currency)}`
                  : undefined
              }
            />
            <Text style={[styles.caption, { color: colors.textMuted }]}>Method</Text>
            <View style={styles.methods}>
              {METHODS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={method === option.value}
                  onPress={() => setMethod(option.value)}
                />
              ))}
            </View>
            <TextField
              label="Reference"
              value={reference}
              onChangeText={setReference}
              placeholder="Transaction ID"
              autoCapitalize="characters"
            />
            <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
            <Button
              title="Save payment"
              onPress={submitPayment}
              loading={recordPayment.isPending}
            />
          </View>
        </KeyboardAvoidingView>
      </Sheet>
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
  },
  editLabel: {
    ...typeScale.bodyStrong,
  },
  topSpacer: {
    width: 24,
  },
  loading: {
    gap: spacing.md,
  },
  retry: {
    marginTop: spacing.sm,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  eyebrow: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typeScale.display,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typeScale.small,
  },
  card: {
    gap: spacing.xs,
  },
  caption: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clientName: {
    ...typeScale.bodyStrong,
  },
  muted: {
    ...typeScale.body,
  },
  body: {
    ...typeScale.body,
  },
  clientLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  link: {
    ...typeScale.small,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    ...typeScale.bodyStrong,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  firstLine: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  lineText: {
    flex: 1,
    gap: 2,
  },
  lineDescription: {
    ...typeScale.body,
  },
  lineAmount: {
    ...typeScale.bodyStrong,
  },
  totalsSpacer: {
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footerHint: {
    ...typeScale.small,
    textAlign: 'center',
  },
  sheetBody: {
    gap: spacing.md,
  },
  methods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
