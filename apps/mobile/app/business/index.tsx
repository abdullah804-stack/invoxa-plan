import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Each business is its own tenant: clients, numbering, brand, reminders and
 * reports never cross over. The list is short, so the switcher is a screen.
 */
export default function BusinessesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { businesses, activeBusinessId, activeRole, setActiveBusiness, refreshBusinesses } =
    useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      await refreshBusinesses();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Businesses</Text>
          <View style={styles.topSpacer} />
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Clients, invoice numbers, brand and reports belong to one business. Nothing is shared
          between them.
        </Text>

        {businesses.map((business) => {
          const active = business.id === activeBusinessId;
          return (
            <Pressable
              key={business.id}
              accessibilityRole="button"
              accessibilityLabel={`${business.name}, ${business.role}${active ? ', current' : ''}`}
              onPress={() => setActiveBusiness(business.id)}
            >
              <Card
                style={[
                  styles.card,
                  active ? { borderColor: colors.accent, backgroundColor: colors.accentSoft } : {},
                ]}
              >
                <View style={styles.cardText}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {business.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {business.role === 'owner'
                      ? 'Owner'
                      : business.role === 'staff'
                        ? 'Staff'
                        : 'Viewer'}
                  </Text>
                </View>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                ) : null}
              </Card>
            </Pressable>
          );
        })}

        {notice ? <Text style={[styles.hint, { color: colors.danger }]}>{notice}</Text> : null}

        <View style={styles.actions}>
          <Button title="New business" onPress={() => router.push('/business/new')} />
          <Button
            title="Join with a code"
            variant="secondary"
            onPress={() => router.push('/business/join')}
          />
          {activeRole ? (
            <Button
              title="Team & roles"
              variant="secondary"
              onPress={() => router.push('/business/team')}
            />
          ) : null}
        </View>
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
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
  },
  topSpacer: {
    width: 24,
  },
  hint: {
    ...typeScale.small,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
