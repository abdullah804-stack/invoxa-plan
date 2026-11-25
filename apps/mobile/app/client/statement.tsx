import { renderStatementHtml } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useProfile, useStatement } from '../../src/api/hooks';
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
 * Client statement. Every number comes from the API's statement builder, which
 * uses the same totals the invoices were issued with; the printable page is the
 * shared renderer, so what is shared is what is on screen.
 */
export default function ClientStatementScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;

  const statement = useStatement(id);
  const profile = useProfile();
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const business = profile.data?.business;

  const html = useMemo(() => {
    if (!statement.data || !business) return '';
    return renderStatementHtml({
      business: {
        name: business.name,
        email: business.email,
        phone: business.phone,
        address: business.address,
        taxId: business.taxId,
        website: business.website,
      },
      client: {
        name: statement.data.client.name,
        email: statement.data.client.email,
        phone: statement.data.client.phone,
        address: statement.data.client.address,
        taxId: statement.data.client.taxId,
      },
      brand: {
        color: business.branding.color,
        template: business.branding.template,
        headerLayout: business.branding.headerLayout,
        pageSize: business.pageSize,
        language: business.language,
        fontPair: business.branding.fontPair,
      },
      sections: statement.data.sections,
      from: statement.data.from,
      to: statement.data.to,
      today: statement.data.today,
    });
  }, [statement.data, business]);

  const fileName = `statement-${(statement.data?.client.name ?? 'client')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 40)}.pdf`;

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

  const empty = (statement.data?.sections.length ?? 0) === 0;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/clients'))}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            Statement
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {statement.data?.client.name ?? 'Client'}
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.small, { color: colors.danger }]}>{notice}</Text>
        </View>
      ) : null}

      {statement.isLoading || profile.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={420} />
        </View>
      ) : statement.isError ? (
        <View style={styles.loading}>
          <ErrorState
            message={errorMessage(statement.error)}
            onRetry={() => void statement.refetch()}
          />
        </View>
      ) : empty ? (
        <View style={styles.loading}>
          <Card>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              This client has no issued invoices yet, so there is nothing to put on a statement.
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
            Sharing a statement PDF works in the Android and iOS app.
          </Text>
        </Card>
      ) : (
        <View style={styles.actions}>
          <Button
            title="Share PDF"
            onPress={() => void share()}
            loading={sharing}
            disabled={empty}
          />
          <Button
            title="Print"
            variant="secondary"
            onPress={() => void print()}
            loading={printing}
            disabled={empty}
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
