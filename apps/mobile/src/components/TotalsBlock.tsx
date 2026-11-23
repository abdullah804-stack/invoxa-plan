import { formatMoney, LABELS } from '@invoxa/shared';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export interface TotalsForDisplay {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid?: number;
  balance?: number;
}

interface TotalsBlockProps {
  totals: TotalsForDisplay;
  currency: string;
  taxMode: 'added' | 'included';
}

/** Subtotal, discount, tax, total, paid and balance, in that order. */
export function TotalsBlock({ totals, currency, taxMode }: TotalsBlockProps) {
  const { colors } = useTheme();
  const paid = totals.paid ?? 0;
  const balance = totals.balance ?? totals.total - paid;

  const rows: { label: string; value: number; muted?: boolean }[] = [
    { label: LABELS.subtotal, value: totals.subtotal, muted: true },
  ];
  if (totals.discount > 0) {
    rows.push({ label: LABELS.discount, value: -totals.discount, muted: true });
  }
  if (totals.tax !== 0) {
    rows.push({
      label: taxMode === 'included' ? LABELS.taxIncluded : LABELS.taxAdded,
      value: totals.tax,
      muted: true,
    });
  }

  return (
    <View style={styles.block}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{row.label}</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>
            {formatMoney(row.value, currency)}
          </Text>
        </View>
      ))}

      <View style={[styles.row, styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.text }]}>{LABELS.total}</Text>
        <Text style={[styles.totalValue, { color: colors.text }]}>
          {formatMoney(totals.total, currency)}
        </Text>
      </View>

      {paid > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{LABELS.amountPaid}</Text>
          <Text style={[styles.value, { color: colors.success }]}>
            {formatMoney(paid, currency)}
          </Text>
        </View>
      ) : null}

      {paid > 0 || balance !== totals.total ? (
        <View style={styles.row}>
          <Text style={[styles.balanceLabel, { color: colors.text }]}>{LABELS.balanceDue}</Text>
          <Text
            style={[styles.balanceValue, { color: balance > 0 ? colors.danger : colors.success }]}
          >
            {formatMoney(balance, currency)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    ...typeScale.small,
  },
  value: {
    ...typeScale.small,
  },
  totalRow: {
    borderTopWidth: 1,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  totalLabel: {
    ...typeScale.bodyStrong,
  },
  totalValue: {
    ...typeScale.section,
  },
  balanceLabel: {
    ...typeScale.bodyStrong,
  },
  balanceValue: {
    ...typeScale.bodyStrong,
  },
});
