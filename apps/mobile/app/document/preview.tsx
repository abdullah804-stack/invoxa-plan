import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrandAsset, useDocument, useProfile } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { InvoiceHtmlView } from '../../src/components/InvoiceHtmlView';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { buildInvoiceHtml, invoiceFileName } from '../../src/lib/invoiceHtml';
import { printInvoiceHtml, shareInvoicePdf } from '../../src/lib/pdf';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * The real document: the shared renderer's HTML in a web view, with the same
 * HTML printed to a PDF that can be shared. An issued document uses the frozen
 * brand asset IDs, fetched by ID, so changing the logo later does not rewrite
 * history.
 */
export default function DocumentPreviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const documentQuery = useDocument(id);
  const profile = useProfile();
  const document = documentQuery.data?.document;

  const snapshotLogoId = document?.brandSnapshot?.branding.logoAssetId ?? null;
  const profileLogoId = profile.data?.business.branding.logoAssetId ?? null;
  const snapshotSignatureId = document?.brandSnapshot?.branding.signatureAssetId ?? null;
  const profileSignatureId = profile.data?.business.branding.signatureAssetId ?? null;

  const logoAsset = useBrandAsset(
    snapshotLogoId && snapshotLogoId !== profileLogoId ? snapshotLogoId : null,
  );
  const signatureAsset = useBrandAsset(
    snapshotSignatureId && snapshotSignatureId !== profileSignatureId ? snapshotSignatureId : null,
  );

  const logoDataUrl = snapshotLogoId
    ? snapshotLogoId === profileLogoId
      ? (profile.data?.logo?.dataUrl ?? null)
      : (logoAsset.data?.asset.dataUrl ?? null)
    : (profile.data?.logo?.dataUrl ?? null);

  const signatureDataUrl = snapshotSignatureId
    ? snapshotSignatureId === profileSignatureId
      ? (profile.data?.signature?.dataUrl ?? null)
      : (signatureAsset.data?.asset.dataUrl ?? null)
    : (profile.data?.signature?.dataUrl ?? null);

  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const html = useMemo(
    () =>
      document ? buildInvoiceHtml(document, profile.data, { logoDataUrl, signatureDataUrl }) : '',
    [document, profile.data, logoDataUrl, signatureDataUrl],
  );

  const share = async () => {
    if (!document) return;
    setNotice(null);
    setSharing(true);
    try {
      await shareInvoicePdf(html, invoiceFileName(document));
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
            {document?.number ?? 'Preview'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            What your client receives
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.noticeText, { color: colors.danger }]}>{notice}</Text>
        </View>
      ) : null}

      {documentQuery.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={420} />
        </View>
      ) : documentQuery.isError ? (
        <View style={styles.loading}>
          <ErrorState
            message={errorMessage(documentQuery.error)}
            onRetry={() => void documentQuery.refetch()}
          />
        </View>
      ) : !document ? (
        <View style={styles.loading}>
          <Card>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              This document could not be found.
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
            PDF export works in the Android and iOS app. The preview above is the document the PDF
            is made from.
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
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
  noticeText: {
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
