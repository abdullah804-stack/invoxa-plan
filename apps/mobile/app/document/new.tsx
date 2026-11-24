import {
  addDays,
  can,
  computeTotals,
  DOCUMENT_TITLES,
  formatMoney,
  type TaxMode,
} from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  useCreateDocument,
  useCreateSavedItem,
  useDocument,
  useExpenses,
  useProfile,
  useProject,
  useSavedItems,
  useUpdateDocument,
} from '../../src/api/hooks';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ClientPicker } from '../../src/components/ClientPicker';
import { ProjectPicker } from '../../src/components/ProjectPicker';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Sheet } from '../../src/components/Sheet';
import { Skeleton } from '../../src/components/Skeleton';
import { TextField } from '../../src/components/TextField';
import { TotalsBlock } from '../../src/components/TotalsBlock';
import { errorMessage } from '../../src/lib/errors';
import { formatMinutes } from '../../src/lib/time';
import {
  amountToInput,
  parseAmountToMinor,
  parsePercentToBasisPoints,
  parseQuantity,
} from '../../src/lib/money';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import type { DocumentDraftBody, DocumentDraftItemInput } from '../../src/api/types';

type DocType = 'invoice' | 'estimate' | 'credit_note';
type DiscountType = 'none' | 'percent' | 'fixed';

interface ItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  /** Kept when the line came from tracked time, so saving keeps the link. */
  timeEntryIds?: string[];
  /** Kept when the line carries a billable expense. */
  expenseIds?: string[];
}

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'credit_note', label: 'Credit' },
];

const DISCOUNT_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'percent', label: 'Percent' },
  { value: 'fixed', label: 'Fixed' },
];

const TAX_OPTIONS: { value: TaxMode; label: string }[] = [
  { value: 'added', label: 'Added' },
  { value: 'included', label: 'Included' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDocType(value: unknown): value is DocType {
  return value === 'invoice' || value === 'estimate' || value === 'credit_note';
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function blankItem(): ItemDraft {
  return {
    key: `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    quantity: '1',
    unitPrice: '',
    discount: '',
  };
}

function newClientUuid(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function DocumentEditorScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole } = useSession();
  const params = useLocalSearchParams<{
    id?: string;
    docType?: string;
    clientId?: string;
    clientName?: string;
  }>();

  const editingId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const existing = useDocument(editingId);
  const profile = useProfile();
  const savedItems = useSavedItems();
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const saveSavedItem = useCreateSavedItem();

  const [docType, setDocType] = useState<DocType>(
    isDocType(params.docType) ? params.docType : 'invoice',
  );
  const [currency, setCurrency] = useState(profile.data?.business.currency ?? 'USD');
  const [clientId, setClientId] = useState<string | null>(
    typeof params.clientId === 'string' && params.clientId ? params.clientId : null,
  );
  const [clientName, setClientName] = useState(
    typeof params.clientName === 'string' ? params.clientName : '',
  );
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [taxMode, setTaxMode] = useState<TaxMode>('added');
  const [taxRate, setTaxRate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  const [hydrated, setHydrated] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [addTime, setAddTime] = useState(true);

  const projectDetail = useProject(projectId ?? undefined);
  const unbilledExpenses = useExpenses({ unbilled: 'true' });

  const canSaveItems = activeRole ? can(activeRole, 'savedItems:write') : false;
  const canSeeProjects = activeRole ? can(activeRole, 'projects:read') : false;
  const busy = createDocument.isPending || updateDocument.isPending;

  // Defaults for a new document come from the business profile.
  useEffect(() => {
    if (editingId || defaultsApplied || !profile.data) return;
    const business = profile.data.business;
    const today = todayIso();
    setCurrency(business.currency);
    setTaxMode(business.taxMode);
    setTaxRate(business.taxRateBp > 0 ? String(business.taxRateBp / 100) : '');
    setIssueDate((current) => current || today);
    setDueDate((current) => current || addDays(today, business.dueDays ?? 14));
    setDefaultsApplied(true);
  }, [profile.data, editingId, defaultsApplied]);

  // A draft being edited fills the form once; typing afterwards is never lost.
  useEffect(() => {
    const document = existing.data?.document;
    if (!document || hydrated) return;
    const docCurrency = document.currency;
    setDocType(document.docType);
    setCurrency(docCurrency);
    setClientId(document.clientId);
    setClientName(document.clientName ?? '');
    setProjectId(document.projectId);
    setItems(
      document.items.map((item) => ({
        key: item.id,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: amountToInput(item.unitPrice, docCurrency),
        discount: item.discountBp ? String(item.discountBp / 100) : '',
        ...(item.timeEntryIds?.length ? { timeEntryIds: item.timeEntryIds } : {}),
        ...(item.expenseIds?.length ? { expenseIds: item.expenseIds } : {}),
      })),
    );
    if (document.discount) {
      setDiscountType(document.discount.type);
      setDiscountValue(
        document.discount.type === 'percent'
          ? String(document.discount.valueBp / 100)
          : amountToInput(document.discount.valueMinor, docCurrency),
      );
    }
    setTaxMode(document.taxMode);
    setTaxRate(document.taxRateBp > 0 ? String(document.taxRateBp / 100) : '');
    setIssueDate(document.issueDate ?? '');
    setDueDate(document.dueDate ?? '');
    setValidUntil(document.validUntil ?? '');
    setReference(document.reference ?? '');
    setNotes(document.notes ?? '');
    setTerms(document.terms ?? '');
    setHydrated(true);
  }, [existing.data, hydrated]);

  const taxRateBp = parsePercentToBasisPoints(taxRate);

  const invoiceDiscount = useMemo(() => {
    if (discountType === 'percent') {
      const bp = parsePercentToBasisPoints(discountValue);
      return bp === null ? null : { type: 'percent' as const, valueBp: bp };
    }
    if (discountType === 'fixed') {
      const minor = parseAmountToMinor(discountValue, currency);
      return minor === null ? null : { type: 'fixed' as const, valueMinor: minor };
    }
    return null;
  }, [discountType, discountValue, currency]);

  // Live totals come from the shared function, never from local arithmetic.
  const totals = useMemo(() => {
    const validItems = items.flatMap((item) => {
      const description = item.description.trim();
      const quantity = parseQuantity(item.quantity);
      const unitPrice = parseAmountToMinor(item.unitPrice, currency);
      const discountBp = parsePercentToBasisPoints(item.discount);
      if (!description || quantity === null || quantity <= 0) return [];
      if (unitPrice === null || discountBp === null) return [];
      return [{ quantity, unitPrice, discountBp }];
    });
    if (validItems.length === 0) return null;
    try {
      return computeTotals({
        items: validItems,
        discount: invoiceDiscount,
        taxRateBp: taxRateBp ?? 0,
        taxMode,
      });
    } catch {
      return null;
    }
  }, [items, currency, invoiceDiscount, taxRateBp, taxMode]);

  const updateItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeItem = (key: string) => {
    setItems((current) => (current.length === 1 ? current : current.filter((i) => i.key !== key)));
  };

  const addSavedLine = (description: string, unitPrice: number, itemCurrency: string) => {
    if (itemCurrency !== currency) return;
    setItems((current) => [
      ...current.filter((item) => item.description.trim() !== '' || item.unitPrice.trim() !== ''),
      {
        key: blankItem().key,
        description,
        quantity: '1',
        unitPrice: amountToInput(unitPrice, currency),
        discount: '',
      },
    ]);
    setSavedOpen(false);
  };

  const addExpenseLine = (description: string, amount: number, id: string) => {
    setItems((current) => [
      ...current.filter((item) => item.description.trim() !== '' || item.unitPrice.trim() !== ''),
      {
        key: blankItem().key,
        description,
        quantity: '1',
        unitPrice: amountToInput(amount, currency),
        discount: '',
        expenseIds: [id],
      },
    ]);
    setExpensesOpen(false);
  };

  const saveLine = (item: ItemDraft) => {
    const description = item.description.trim();
    const unitPrice = parseAmountToMinor(item.unitPrice, currency);
    if (!description || unitPrice === null) {
      setNotice('Add a description and a price before saving the line.');
      return;
    }
    saveSavedItem.mutate(
      { description, unitPrice, currency },
      {
        onSuccess: () => setNotice('Line saved. Find it under Saved items.'),
        onError: (error) => setNotice(errorMessage(error)),
      },
    );
  };

  const buildPayload = (): DocumentDraftBody | null => {
    const next: Record<string, string> = {};
    if (!clientId) next['clientId'] = 'Choose a client';

    const validItems: DocumentDraftItemInput[] = [];
    items.forEach((item, index) => {
      const description = item.description.trim();
      if (!description) next[`description-${index}`] = 'Add a description';
      const quantity = parseQuantity(item.quantity);
      if (quantity === null || quantity <= 0) next[`quantity-${index}`] = 'Enter a quantity';
      const unitPrice = parseAmountToMinor(item.unitPrice, currency);
      if (unitPrice === null) next[`unitPrice-${index}`] = 'Enter a price';
      const discountBp = parsePercentToBasisPoints(item.discount);
      if (discountBp === null) next[`discount-${index}`] = '0 to 100';

      if (
        description &&
        quantity !== null &&
        quantity > 0 &&
        unitPrice !== null &&
        discountBp !== null
      ) {
        validItems.push({
          description,
          quantity,
          unitPrice,
          ...(discountBp > 0 ? { discountBp } : {}),
          ...(item.timeEntryIds?.length ? { timeEntryIds: item.timeEntryIds } : {}),
          ...(item.expenseIds?.length ? { expenseIds: item.expenseIds } : {}),
        });
      }
    });
    if (validItems.length === 0) next['items'] = 'Add at least one line';

    if (taxRateBp === null) next['taxRate'] = 'Tax rate is 0 to 100';
    if (discountType !== 'none' && !invoiceDiscount) next['discount'] = 'Check the discount value';

    if (issueDate.trim() && !ISO_DATE.test(issueDate.trim())) {
      next['issueDate'] = 'Use YYYY-MM-DD';
    }
    if (docType === 'estimate') {
      if (validUntil.trim() && !ISO_DATE.test(validUntil.trim())) {
        next['validUntil'] = 'Use YYYY-MM-DD';
      }
    } else if (dueDate.trim()) {
      if (!ISO_DATE.test(dueDate.trim())) {
        next['dueDate'] = 'Use YYYY-MM-DD';
      } else if (
        issueDate.trim() &&
        ISO_DATE.test(issueDate.trim()) &&
        dueDate.trim() < issueDate.trim()
      ) {
        next['dueDate'] = 'Due date cannot be before the issue date';
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      items: validItems,
      currency,
      discount: invoiceDiscount,
      taxRateBp: taxRateBp ?? 0,
      taxMode,
      ...(clientId ? { clientId } : {}),
      projectId: projectId ?? null,
      ...(projectId && addTime ? { billProjectTime: true } : {}),
      ...(issueDate.trim() ? { issueDate: issueDate.trim() } : {}),
      ...(docType === 'estimate'
        ? validUntil.trim()
          ? { validUntil: validUntil.trim() }
          : {}
        : dueDate.trim()
          ? { dueDate: dueDate.trim() }
          : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(terms.trim() ? { terms: terms.trim() } : {}),
    };
  };

  const save = async () => {
    setFormError(null);
    setNotice(null);
    const body = buildPayload();
    if (!body) return;
    try {
      const result = editingId
        ? await updateDocument.mutateAsync({ id: editingId, input: body })
        : await createDocument.mutateAsync({ ...body, clientUuid: newClientUuid(), docType });
      router.replace(`/document/${result.document.id}`);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const loadingDraft = Boolean(editingId) && existing.isLoading && !hydrated;
  const loadingProfile = !editingId && profile.isLoading && !defaultsApplied;

  const savedForCurrency = (savedItems.data?.savedItems ?? []).filter(
    (item) => item.currency === currency,
  );
  const unbilledForCurrency = (unbilledExpenses.data?.expenses ?? []).filter(
    (expense) =>
      expense.currency === currency && !items.some((item) => item.expenseIds?.includes(expense.id)),
  );

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
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/invoices'))}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>
              {editingId ? `Edit ${DOCUMENT_TITLES[docType].toLowerCase()}` : 'New document'}
            </Text>
            <View style={styles.topSpacer} />
          </View>

          {notice ? (
            <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.noticeText, { color: colors.accent }]}>{notice}</Text>
            </View>
          ) : null}

          {loadingDraft || loadingProfile ? (
            <View style={styles.loading}>
              <Skeleton height={48} />
              <Skeleton height={96} />
              <Skeleton height={160} />
            </View>
          ) : editingId && existing.isError ? (
            <Card>
              <Text style={[styles.muted, { color: colors.danger }]}>
                {errorMessage(existing.error)}
              </Text>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => void existing.refetch()}
                style={styles.retry}
              />
            </Card>
          ) : (
            <>
              {editingId ? (
                <Text style={[styles.typeLabel, { color: colors.textMuted }]}>
                  {DOCUMENT_TITLES[docType]}
                </Text>
              ) : (
                <Segmented
                  options={DOC_TYPE_OPTIONS}
                  value={docType}
                  onChange={setDocType}
                  accessibilityLabel="Document type"
                />
              )}

              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Client</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose a client"
                  onPress={() => setPickerOpen(true)}
                  style={[
                    styles.clientRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: errors['clientId'] ? colors.danger : colors.border,
                    },
                  ]}
                >
                  <View style={styles.clientText}>
                    <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                      {clientName || 'Choose a client'}
                    </Text>
                    <Text style={[styles.clientHint, { color: colors.textMuted }]}>
                      {clientName ? 'Tap to change' : 'From your client book'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
                {errors['clientId'] ? (
                  <Text style={[styles.error, { color: colors.danger }]}>{errors['clientId']}</Text>
                ) : null}
              </View>

              {canSeeProjects ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Project</Text>
                    {projectId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove the project from this draft"
                        onPress={() => setProjectId(null)}
                        hitSlop={8}
                      >
                        <Text style={[styles.link, { color: colors.accent }]}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose a project"
                    onPress={() => setProjectOpen(true)}
                    style={[
                      styles.clientRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: errors['projectId'] ? colors.danger : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.clientText}>
                      <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                        {projectDetail.data?.project.name ?? 'No project'}
                      </Text>
                      <Text style={[styles.clientHint, { color: colors.textMuted }]}>
                        {projectId ? 'Tap to change' : 'Link tracked time to this draft'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                  {errors['projectId'] ? (
                    <Text style={[styles.error, { color: colors.danger }]}>
                      {errors['projectId']}
                    </Text>
                  ) : null}
                  {projectId ? (
                    <View
                      style={[
                        styles.timeRow,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.clientText}>
                        <Text style={[styles.clientName, { color: colors.text }]}>
                          Add unbilled time
                        </Text>
                        <Text style={[styles.clientHint, { color: colors.textMuted }]}>
                          {projectDetail.isLoading
                            ? 'Checking tracked time…'
                            : (projectDetail.data?.time.unbilledMinutes ?? 0) > 0
                              ? `${formatMinutes(projectDetail.data?.time.unbilledMinutes ?? 0)} unbilled · ${formatMoney(projectDetail.data?.time.unbilledValueMinor ?? 0, currency)}`
                              : 'No unbilled time on this project'}
                        </Text>
                      </View>
                      <Switch
                        value={addTime}
                        onValueChange={setAddTime}
                        disabled={(projectDetail.data?.time.unbilledMinutes ?? 0) === 0}
                        accessibilityLabel="Add unbilled time"
                        trackColor={{ true: colors.accentSoft, false: colors.surfaceMuted }}
                        thumbColor={addTime ? colors.accent : colors.surface}
                      />
                    </View>
                  ) : null}
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    Unbilled hours are added as lines when you save.
                  </Text>
                </View>
              ) : null}

              <View style={styles.dateRow}>
                <TextField
                  label="Issue date"
                  value={issueDate}
                  onChangeText={setIssueDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors['issueDate']}
                />
                <TextField
                  label={docType === 'estimate' ? 'Valid until' : 'Due date'}
                  value={docType === 'estimate' ? validUntil : dueDate}
                  onChangeText={docType === 'estimate' ? setValidUntil : setDueDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors[docType === 'estimate' ? 'validUntil' : 'dueDate']}
                />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Lines</Text>
                  <View style={styles.headerLinks}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add a billable expense"
                      onPress={() => setExpensesOpen(true)}
                      hitSlop={8}
                    >
                      <Text style={[styles.link, { color: colors.accent }]}>Expenses</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Saved line items"
                      onPress={() => setSavedOpen(true)}
                      hitSlop={8}
                    >
                      <Text style={[styles.link, { color: colors.accent }]}>Saved items</Text>
                    </Pressable>
                  </View>
                </View>

                {items.map((item, index) => (
                  <Card key={item.key} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Text style={[styles.itemIndex, { color: colors.textMuted }]}>
                        Line {index + 1}
                      </Text>
                      {items.length > 1 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove line ${index + 1}`}
                          onPress={() => removeItem(item.key)}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>

                    <TextField
                      value={item.description}
                      onChangeText={(value) => updateItem(item.key, { description: value })}
                      placeholder="What are you charging for?"
                      error={errors[`description-${index}`]}
                    />

                    <View style={styles.amountRow}>
                      <View style={styles.amountField}>
                        <TextField
                          label="Qty"
                          value={item.quantity}
                          onChangeText={(value) => updateItem(item.key, { quantity: value })}
                          placeholder="1"
                          keyboardType="decimal-pad"
                          error={errors[`quantity-${index}`]}
                        />
                      </View>
                      <View style={styles.amountField}>
                        <TextField
                          label={`Price (${currency})`}
                          value={item.unitPrice}
                          onChangeText={(value) => updateItem(item.key, { unitPrice: value })}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          error={errors[`unitPrice-${index}`]}
                        />
                      </View>
                      <View style={styles.discountField}>
                        <TextField
                          label="Disc %"
                          value={item.discount}
                          onChangeText={(value) => updateItem(item.key, { discount: value })}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          error={errors[`discount-${index}`]}
                        />
                      </View>
                    </View>

                    {canSaveItems ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Save line ${index + 1} for reuse`}
                        onPress={() => saveLine(item)}
                        hitSlop={8}
                        style={styles.saveLine}
                      >
                        <Ionicons name="bookmark-outline" size={14} color={colors.accent} />
                        <Text style={[styles.link, { color: colors.accent }]}>Save line</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                ))}

                {errors['items'] ? (
                  <Text style={[styles.error, { color: colors.danger }]}>{errors['items']}</Text>
                ) : null}

                <Button
                  title="Add a line"
                  variant="secondary"
                  onPress={() => setItems((current) => [...current, blankItem()])}
                />
              </View>

              <Card style={styles.summaryCard}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  Discount and tax
                </Text>
                <Segmented
                  options={DISCOUNT_OPTIONS}
                  value={discountType}
                  onChange={setDiscountType}
                  accessibilityLabel="Discount type"
                />
                {discountType !== 'none' ? (
                  <TextField
                    label={discountType === 'percent' ? 'Discount %' : `Discount (${currency})`}
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    placeholder={discountType === 'percent' ? '10' : '0.00'}
                    keyboardType="decimal-pad"
                    error={errors['discount']}
                  />
                ) : null}

                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Tax mode</Text>
                <Segmented
                  options={TAX_OPTIONS}
                  value={taxMode}
                  onChange={setTaxMode}
                  accessibilityLabel="Tax mode"
                />
                <TextField
                  label="Tax rate %"
                  value={taxRate}
                  onChangeText={setTaxRate}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  error={errors['taxRate']}
                  hint={
                    taxMode === 'included'
                      ? 'Prices already include tax; the tax is taken out of the total.'
                      : 'Tax is added on top of the discounted subtotal.'
                  }
                />
              </Card>

              <Card style={styles.summaryCard}>
                {totals ? (
                  <TotalsBlock totals={totals} currency={currency} taxMode={taxMode} />
                ) : (
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    Add a line with a price to see the total.
                  </Text>
                )}
              </Card>

              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Details</Text>
                <TextField
                  label="Reference"
                  value={reference}
                  onChangeText={setReference}
                  placeholder="Project or PO number"
                  autoCapitalize="characters"
                />
                <TextField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="A note for your client"
                  multiline
                />
                <TextField
                  label="Terms"
                  value={terms}
                  onChangeText={setTerms}
                  placeholder="Payment terms"
                  multiline
                />
              </View>

              {formError ? (
                <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text>
              ) : null}

              <Button title="Save draft" onPress={() => void save()} loading={busy} />

              <Text style={[styles.footerHint, { color: colors.textMuted }]}>
                Numbers are assigned when you issue the document, not before.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ClientPicker
        visible={pickerOpen}
        selectedId={clientId}
        onClose={() => setPickerOpen(false)}
        onSelect={(client) => {
          setClientId(client.id);
          setClientName(client.name);
          setPickerOpen(false);
          // A project belongs to one client; keep the draft consistent with it.
          const projectClient = projectDetail.data?.project.clientId ?? null;
          if (projectClient && projectClient !== client.id) setProjectId(null);
        }}
        onCreate={() => {
          setPickerOpen(false);
          router.push('/client/new');
        }}
      />

      <ProjectPicker
        visible={projectOpen}
        selectedId={projectId}
        clientId={clientId}
        onClose={() => setProjectOpen(false)}
        onSelect={(project) => {
          setProjectId(project.id);
          setProjectOpen(false);
          if (!clientId && project.clientId) {
            setClientId(project.clientId);
            setClientName(project.clientName ?? '');
          }
        }}
      />

      <Sheet
        visible={expensesOpen}
        title="Billable expenses"
        onClose={() => setExpensesOpen(false)}
      >
        {unbilledExpenses.isLoading ? (
          <View style={styles.sheetCentered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : unbilledExpenses.isError ? (
          <Text style={[styles.muted, { color: colors.danger }]}>
            {errorMessage(unbilledExpenses.error)}
          </Text>
        ) : unbilledForCurrency.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            No unbilled expenses in {currency}. Mark an expense as billable to see it here.
          </Text>
        ) : (
          unbilledForCurrency.map((expense) => (
            <Pressable
              key={expense.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${expense.description}`}
              onPress={() => addExpenseLine(expense.description, expense.amount, expense.id)}
              style={[
                styles.savedRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.clientText}>
                <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                  {expense.description}
                </Text>
                <Text style={[styles.clientHint, { color: colors.textMuted }]}>
                  {amountToInput(expense.amount, expense.currency)} {expense.currency}
                  {expense.vendor ? ` · ${expense.vendor}` : ''}
                </Text>
              </View>
              <Ionicons name="add" size={18} color={colors.accent} />
            </Pressable>
          ))
        )}
      </Sheet>

      <Sheet visible={savedOpen} title="Saved items" onClose={() => setSavedOpen(false)}>
        {savedItems.isLoading ? (
          <View style={styles.sheetCentered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : savedItems.isError ? (
          <Text style={[styles.muted, { color: colors.danger }]}>
            {errorMessage(savedItems.error)}
          </Text>
        ) : savedForCurrency.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            No saved lines in {currency} yet. Save a line from the editor and it appears here.
          </Text>
        ) : (
          savedForCurrency.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.description}`}
              onPress={() => addSavedLine(item.description, item.unitPrice, item.currency)}
              style={[
                styles.savedRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.clientText}>
                <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={[styles.clientHint, { color: colors.textMuted }]}>
                  {amountToInput(item.unitPrice, item.currency)} {item.currency}
                </Text>
              </View>
              <Ionicons name="add" size={18} color={colors.accent} />
            </Pressable>
          ))
        )}
      </Sheet>
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
  typeLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    ...typeScale.small,
  },
  loading: {
    gap: spacing.md,
  },
  retry: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  clientText: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    ...typeScale.bodyStrong,
  },
  clientHint: {
    ...typeScale.small,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  itemCard: {
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemIndex: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  amountField: {
    flex: 3,
  },
  discountField: {
    flex: 2,
  },
  saveLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  link: {
    ...typeScale.small,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  error: {
    ...typeScale.small,
  },
  muted: {
    ...typeScale.body,
  },
  footerHint: {
    ...typeScale.small,
    textAlign: 'center',
  },
  sheetCentered: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  hint: {
    ...typeScale.small,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
