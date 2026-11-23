import { formatMoney } from '@invoxa/shared';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, readableOn, spacing } from '../theme/tokens';

interface BrandPreviewProps {
  businessName: string;
  color: string;
  logoDataUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  currency?: string;
}

/**
 * A live preview of the invoice header and totals. M6 replaces this with the
 * shared HTML renderer that produces the real PDF; the shape is the same:
 * logo or name, contact block, document title, a line and the total.
 */
export function BrandPreview({
  businessName,
  color,
  logoDataUrl,
  email,
  phone,
  address,
  currency = 'USD',
}: BrandPreviewProps) {
  const onBrand = readableOn(color);
  const name = businessName.trim() || 'Your business';
  const contact = [email, phone, address].filter(Boolean).join(' · ');

  return (
    <View style={styles.paper} accessibilityLabel="Brand preview">
      <View style={[styles.band, { backgroundColor: color }]}>
        <View style={styles.bandInner}>
          {logoDataUrl ? (
            <Image source={{ uri: logoDataUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={[styles.bandInitial, { color: onBrand }]}>{name.slice(0, 1)}</Text>
          )}
          <Text style={[styles.bandName, { color: onBrand }]} numberOfLines={2}>
            {name}
          </Text>
        </View>
        <Text style={[styles.bandLabel, { color: onBrand }]}>INVOICE</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.caption}>From</Text>
            <Text style={styles.partyName} numberOfLines={1}>
              {name}
            </Text>
            {contact ? (
              <Text style={styles.partyDetail} numberOfLines={2}>
                {contact}
              </Text>
            ) : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.caption}>Bill to</Text>
            <Text style={styles.partyName}>Sample client</Text>
            <Text style={styles.partyDetail}>client@example.com</Text>
          </View>
        </View>

        <View style={styles.line}>
          <Text style={[styles.caption, styles.lineDescription]}>Description</Text>
          <Text style={[styles.caption, styles.lineAmount]}>Amount</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineText}>Design work</Text>
          <Text style={styles.lineText}>{formatMoney(12000, currency)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineText}>Consultation, 2 hours</Text>
          <Text style={styles.lineText}>{formatMoney(8000, currency)}</Text>
        </View>

        <View style={[styles.totalRow, { borderTopColor: color }]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, { color }]}>{formatMoney(20000, currency)}</Text>
        </View>
        <View style={[styles.numberPill, { backgroundColor: color }]}>
          <Text style={[styles.numberText, { color: onBrand }]}>INV-0001</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E3DFD2',
  },
  band: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bandInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bandInitial: {
    fontFamily: fonts.heading,
    fontSize: 22,
    width: 32,
  },
  bandName: {
    fontFamily: fonts.headingSemibold,
    fontSize: 16,
    flex: 1,
  },
  bandLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  parties: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  party: {
    flex: 1,
    gap: 2,
  },
  caption: {
    fontFamily: fonts.bodySemibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#7A857E',
    textTransform: 'uppercase',
  },
  partyName: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: '#16211C',
  },
  partyDetail: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: '#5C6B63',
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDEAE0',
  },
  lineDescription: {
    flex: 1,
  },
  lineAmount: {
    textAlign: 'right',
  },
  lineText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: '#26332C',
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 2,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 10,
    color: '#5C6B63',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  totalValue: {
    fontFamily: fonts.heading,
    fontSize: 22,
  },
  numberPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  numberText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 9,
    letterSpacing: 0.6,
  },
});
