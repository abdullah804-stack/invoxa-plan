import { renderReceiptHtml } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useProfile, useReceipt } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { InvoiceHtmlView } from '../../src/components/InvoiceHtmlView';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { printInvoiceHtml, shareInvoicePdf } from '../../src/lib/pdf';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Receipt for a paid invoice. It is built from the stored document (frozen brand
 * and client snapshots), so a receipt reprinted later still says what was paid.
 */
export default function ReceiptScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const receipt = useReceipt(id);
  const profile = useProfile();
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const document = receipt.data?.document;
  const business = profile.data?.business;
  const snapshot = document?.brandSnapshot;

  const html = useMemo(() => {
    if (!document) return '';
    return renderReceiptHtml({
      document: {
        number: document.number,
        issueDate: document.issueDate,
        currency: document.currency,
        taxRateBp: document.taxRateBp,
        taxMode: document.taxMode,
        discount: document.discount,
        lateFeesMinor: document.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0),
        items: document.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountBp: item.discountBp ?? 0,
          unit: item.unit ?? null,
        })),
        payments: document.payments.map((payment) => ({
          amount: payment.amount,
          method: payment.method,
          paidAt: payment.paidAt,
          reference: payment.reference,
        })),
      },
      business: {
        name: snapshot?.businessName ?? business?.name ?? 'Your business',
        email: snapshot?.email ?? business?.email ?? null,
        phone: snapshot?.phone ?? business?.phone ?? null,
        address: snapshot?.address ?? business?.address ?? null,
        taxId: snapshot?.taxId ?? business?.taxId ?? null,
        website: snapshot?.website ?? business?.website ?? null,
      },
      client: {
        name: document.clientSnapshot?.name ?? document.clientName ?? 'No client',
        email: document.clientSnapshot?.email ?? null,
        phone: document.clientSnapshot?.phone ?? null,
        address: document.clientSnapshot?.address ?? null,
        taxId: document.clientSnapshot?.taxId ?? null,
      },
      brand: {
        color: snapshot?.branding.color ?? business?.branding.color ?? '#1F5F4A',
        template: snapshot?.branding.template ?? business?.branding.template ?? 'classic',
        headerLayout:
          snapshot?.branding.headerLayout ?? business?.branding.headerLayout ?? 'logo-left',
        pageSize: snapshot?.pageSize ?? business?.pageSize ?? 'A4',
        language: snapshot?.language ?? business?.language ?? 'en',
        fontPair: snapshot?.branding.fontPair ?? business?.branding.fontPair ?? 'manrope-inter',
      },
    });
  }, [document, business, snapshot]);

  const fileName = `${(document?.number ?? 'receipt').replace(/[^A-Za-z0-9._-]/g, '-')}-receipt.pdf`;

  const share = async () => {
    setNotice(null);
    setSharing(true);
    try {
      await shareInvoicePdf(html, fileName);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSharing(false);
    }
  };

  const print = async () => {
    setNotice(null);
    setPrinting(true);
    try {
      await printInvoiceHtml(html);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/invoices'))}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            Receipt
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {document?.number ?? ''}
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.small, { color: colors.danger }]}>{notice}</Text>
        </View>
      ) : null}

      {receipt.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={420} />
        </View>
      ) : receipt.isError ? (
        <View style={styles.loading}>
          <ErrorState
            message={errorMessage(receipt.error)}
            onRetry={() => void receipt.refetch()}
          />
        </View>
      ) : !document ? (
        <View style={styles.loading}>
          <Card>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              A receipt needs at least one recorded payment.
            </Text>
          </Card>
        </View>
      ) : (
        <View style={[styles.paper, { borderColor: colors.border }]}>
          <InvoiceHtmlView html={html} style={styles.webview} />
        </View>
      )}

      {Platform.OS === 'web' ? (
        <Card>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Sharing a receipt PDF works in the Android and iOS app.
          </Text>
        </Card>
      ) : (
        <View style={styles.actions}>
          <Button
            title="Share PDF"
            onPress={() => void share()}
            loading={sharing}
            disabled={!document}
          />
          <Button
            title="Print"
            variant="secondary"
            onPress={() => void print()}
            loading={printing}
            disabled={!document}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  spacer: {
    width: 24,
  },
  title: {
    ...typeScale.section,
  },
  subtitle: {
    ...typeScale.small,
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  small: {
    ...typeScale.small,
  },
  loading: {
    paddingHorizontal: spacing.lg,
  },
  paper: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  muted: {
    ...typeScale.body,
  },
});
