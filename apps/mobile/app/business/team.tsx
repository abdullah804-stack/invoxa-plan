import { can } from '@invoxa/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useCreateInvite,
  useLeaveBusiness,
  useRemoveMember,
  useRevokeInvite,
  useTeam,
  useTransferOwnership,
  useUpdateMemberRole,
} from '../../src/api/hooks';
import type { Member } from '../../src/api/types';
import { useSession } from '../../src/auth/SessionProvider';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { SkeletonRows } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/States';
import { errorMessage } from '../../src/lib/errors';
import { radius, spacing, typeScale } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

const ROLE_OPTIONS: { value: 'staff' | 'viewer'; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
];

function roleLabel(role: string): string {
  return role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : 'Viewer';
}

/** Owners invite, remove and change roles; everyone can see who is here. */
export default function TeamScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeRole, refreshBusinesses, businesses, activeBusinessId } = useSession();
  const team = useTeam();

  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveBusiness = useLeaveBusiness();
  const transferOwnership = useTransferOwnership();

  const canManage = activeRole ? can(activeRole, 'members:manage') : false;
  const business = businesses.find((entry) => entry.id === activeBusinessId);

  const [inviteRole, setInviteRole] = useState<'staff' | 'viewer'>('staff');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invite = async () => {
    setNotice(null);
    setCreatedCode(null);
    try {
      const result = await createInvite.mutateAsync(inviteRole);
      setCreatedCode(result.invite.code);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const shareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Join ${business?.name ?? 'my business'} on Invoxa as ${roleLabel(inviteRole)}. Invite code: ${code}`,
      });
    } catch {
      // A dismissed share sheet is not an error.
    }
  };

  const confirmRemove = (member: Member) => {
    Alert.alert(
      `Remove ${member.name}?`,
      'They lose access to this business straight away. Their account is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeMember.mutateAsync(member.id).catch((error) => {
              setNotice(errorMessage(error));
            });
          },
        },
      ],
    );
  };

  const confirmTransfer = (member: Member) => {
    Alert.alert(
      `Make ${member.name} the owner?`,
      'You become staff. Only the other owner can change roles or settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: () => {
            void transferOwnership
              .mutateAsync(member.id)
              .then(() => refreshBusinesses())
              .catch((error) => {
                setNotice(errorMessage(error));
              });
          },
        },
      ],
    );
  };

  const confirmLeave = () => {
    Alert.alert('Leave this business?', 'You can only return with a new invite code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void leaveBusiness
            .mutateAsync()
            .then(async () => {
              await refreshBusinesses();
              router.replace('/');
            })
            .catch((error) => {
              setNotice(errorMessage(error));
            });
        },
      },
    ]);
  };

  const members = team.data?.members ?? [];
  const invites = team.data?.invites ?? [];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={team.isRefetching}
            onRefresh={() => void team.refetch()}
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
          <Text style={[styles.title, { color: colors.text }]}>Team</Text>
          <View style={styles.topSpacer} />
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Owners can change settings and void documents. Staff can invoice, take payments and add
          clients. Viewers can only read.
        </Text>

        {team.isLoading ? (
          <SkeletonRows rows={3} />
        ) : team.isError ? (
          <ErrorState message={errorMessage(team.error)} onRetry={() => void team.refetch()} />
        ) : (
          <>
            {members.map((member) => (
              <Card key={member.id} style={styles.memberCard}>
                <View style={styles.memberTop}>
                  <View style={styles.memberText}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {member.name}
                      {member.isYou ? ' (you)' : ''}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                      {member.email || 'No email'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          member.role === 'owner' ? colors.accentSoft : colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: member.role === 'owner' ? colors.accent : colors.textMuted },
                      ]}
                    >
                      {roleLabel(member.role)}
                    </Text>
                  </View>
                </View>

                {canManage && !member.isYou && member.role !== 'owner' ? (
                  <View style={styles.memberActions}>
                    <Segmented
                      options={ROLE_OPTIONS}
                      value={member.role === 'viewer' ? 'viewer' : 'staff'}
                      onChange={(role) => {
                        setNotice(null);
                        void updateRole
                          .mutateAsync({ id: member.id, role })
                          .catch((error) => setNotice(errorMessage(error)));
                      }}
                      accessibilityLabel={`Role for ${member.name}`}
                    />
                    <Button
                      title="Remove"
                      variant="danger"
                      onPress={() => confirmRemove(member)}
                      loading={removeMember.isPending}
                    />
                  </View>
                ) : null}

                {canManage && !member.isYou && member.role === 'owner' ? (
                  <Button
                    title="Transfer ownership"
                    variant="secondary"
                    onPress={() => confirmTransfer(member)}
                    loading={transferOwnership.isPending}
                  />
                ) : null}
              </Card>
            ))}

            {canManage ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Invite</Text>
                <Card style={styles.card}>
                  <Segmented
                    options={ROLE_OPTIONS}
                    value={inviteRole}
                    onChange={(value) => {
                      setInviteRole(value);
                      setCreatedCode(null);
                    }}
                    accessibilityLabel="Invite role"
                  />
                  <Button
                    title="Create invite code"
                    onPress={() => void invite()}
                    loading={createInvite.isPending}
                  />
                  {createdCode ? (
                    <View style={[styles.codeBox, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.code, { color: colors.text }]}>{createdCode}</Text>
                      <Text style={[styles.hint, { color: colors.textMuted }]}>
                        Works once, expires in 7 days. Share it with one person.
                      </Text>
                      <Button
                        title="Share code"
                        variant="secondary"
                        onPress={() => void shareCode(createdCode)}
                      />
                    </View>
                  ) : null}
                  {notice ? (
                    <Text style={[styles.hint, { color: colors.danger }]}>{notice}</Text>
                  ) : null}
                </Card>
              </View>
            ) : null}

            {canManage && invites.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  Pending invites
                </Text>
                {invites.map((pending) => (
                  <Card key={pending.id} style={styles.inviteCard}>
                    <View style={styles.memberText}>
                      <Text style={[styles.name, { color: colors.text }]}>
                        {roleLabel(pending.role)} invite
                      </Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        Expires {pending.expiresAt.slice(0, 10)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Revoke invite"
                      onPress={() => {
                        setNotice(null);
                        void revokeInvite
                          .mutateAsync(pending.id)
                          .catch((error) => setNotice(errorMessage(error)));
                      }}
                      hitSlop={10}
                    >
                      <Text style={[styles.meta, { color: colors.danger }]}>Revoke</Text>
                    </Pressable>
                  </Card>
                ))}
              </View>
            ) : null}

            {!canManage ? (
              <EmptyState
                title="Only owners manage the team"
                message="Ask an owner if someone needs to join, leave or change role."
              />
            ) : null}

            {activeRole !== 'owner' ? (
              <Button title="Leave business" variant="danger" onPress={confirmLeave} />
            ) : null}
          </>
        )}
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
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    gap: spacing.md,
  },
  memberCard: {
    gap: spacing.md,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  memberText: {
    flex: 1,
    gap: 2,
  },
  memberActions: {
    gap: spacing.sm,
  },
  name: {
    ...typeScale.bodyStrong,
  },
  meta: {
    ...typeScale.small,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typeScale.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  codeBox: {
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  code: {
    ...typeScale.display,
    letterSpacing: 4,
    textAlign: 'center',
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
