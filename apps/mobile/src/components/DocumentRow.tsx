import { formatDate, formatMoney } from '@invoxa/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DocumentRecord } from '../api/types';
import { spacing, typeScale } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { StatusPill } from './StatusPill';

export function DocumentRow({
  document,
  onPress,
}: {
  document: DocumentRecord;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const subtitle =
    document.docType === 'estimate' && document.validUntil
      ? `Valid until ${formatDate(document.validUntil)}`
      : document.dueDate
        ? `Due ${formatDate(document.dueDate)}`
        : document.issueDate
          ? formatDate(document.issueDate)
          : 'No date yet';

  const row = (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {document.clientName ?? 'No client'}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {document.number ?? 'No number yet'}
          </Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: colors.text }]}>
          {formatMoney(document.totals.total, document.currency)}
        </Text>
        <StatusPill status={document.shownStatus} />
      </View>
    </View>
  );

  if (!onPress) return row;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${document.number ?? 'Draft'} for ${document.clientName ?? 'no client'}`}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typeScale.bodyStrong,
  },
  meta: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metaText: {
    ...typeScale.small,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  amount: {
    ...typeScale.bodyStrong,
  },
  pressed: {
    opacity: 0.7,
  },
});
