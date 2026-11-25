import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useExportBackup, usePreviewBackup, useRestoreBackup } from '../src/api/hooks';
import type { BackupPreview, RestoreResult } from '../src/api/types';
import { useSession } from '../src/auth/SessionProvider';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { errorMessage } from '../src/lib/errors';
import { spacing, typeScale } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

function summary(counts: {
  clients: number;
  projects: number;
  documents: number;
  expenses: number;
  timeEntries: number;
  savedItems: number;
  recurring: number;
}): string {
  return [
    `${counts.clients} clients`,
    `${counts.documents} documents`,
    `${counts.expenses} expenses`,
    `${counts.projects} projects`,
    `${counts.timeEntries} time entries`,
    `${counts.savedItems} saved items`,
    `${counts.recurring} recurring schedules`,
  ].join(' · ');
}

/**
 * Export writes one JSON file and hands it to the share sheet. Restore reads a
 * file, validates it on the server, shows what it found and only then merges.
 */
export default function BackupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshBusinesses } = useSession();

  const exportBackup = useExportBackup();
  const previewBackup = usePreviewBackup();
  const restoreBackup = useRestoreBackup();

  const [file, setFile] = useState<unknown>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const share = async () => {
    setNotice(null);
    setResult(null);
    try {
      const backup = await exportBackup.mutateAsync();
      const json = JSON.stringify(backup, null, 2);
      const directory = FileSystem.cacheDirectory;
      const name = `invoxa-backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (!directory || !(await Sharing.isAvailableAsync())) {
        setNotice('Sharing is not available on this device, so the file was not written.');
        return;
      }

      const uri = `${directory}${name}`;
      await FileSystem.writeAsStringAsync(uri, json);
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: name,
        UTI: 'public.json',
      });
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const pick = async () => {
    setNotice(null);
    setResult(null);
    setPreview(null);
    setFile(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset) return;

      const text = await FileSystem.readAsStringAsync(asset.uri);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setNotice('That file is not valid JSON.');
        return;
      }

      const checked = await previewBackup.mutateAsync(parsed);
      setFile(parsed);
      setPreview(checked);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const confirmRestore = () => {
    if (!file || !preview) return;
    setNotice(null);
    Alert.alert(
      'Restore this backup?',
      `${summary(preview.counts)}\n\n${preview.existingDocuments} documents are already here and will be kept, not duplicated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            void restoreBackup
              .mutateAsync(file)
              .then(async (restored) => {
                setResult(restored);
                setPreview(null);
                setFile(null);
                await refreshBusinesses();
              })
              .catch((error) => setNotice(errorMessage(error)));
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Backup</Text>
          <View style={styles.topSpacer} />
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          A backup is the complete active business: its profile and brand, every client, project,
          document with payments, recurring schedule, expense, tracked time entry and saved item. No
          record is left out. Team members, invites and the activity log are not in the file,
          because they belong to people rather than to the billing records. The file is plain JSON,
          so keep it somewhere private.
        </Text>

        <Card style={styles.card}>
          <Text style={[styles.heading, { color: colors.text }]}>Export</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Writes one file and opens your share sheet. Send it to yourself, a drive or your
            computer.
          </Text>
          <Button
            title="Export and share"
            onPress={() => void share()}
            loading={exportBackup.isPending}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.heading, { color: colors.text }]}>Restore</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Restoring merges into the active business. Documents match by their device ID, so the
            same file twice adds nothing twice; a restored invoice gets a fresh number from this
            business&apos;s series.
          </Text>
          <Button
            title="Choose a backup file"
            variant="secondary"
            onPress={() => void pick()}
            loading={previewBackup.isPending}
          />

          {preview ? (
            <View style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.heading, { color: colors.text }]}>This file contains</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {summary(preview.counts)}
              </Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {preview.existingDocuments} documents are already in this business.
              </Text>
              <Button
                title="Restore these records"
                onPress={confirmRestore}
                loading={restoreBackup.isPending}
              />
            </View>
          ) : null}

          {result ? (
            <View style={[styles.preview, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.heading, { color: colors.text }]}>Restored</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Added {summary(result.restored)}.
              </Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Kept what was already here: {result.skipped.documents} documents,{' '}
                {result.skipped.expenses} expenses, {result.skipped.timeEntries} time entries,{' '}
                {result.skipped.recurring} recurring schedules.
              </Text>
            </View>
          ) : null}

          {notice ? <Text style={[styles.hint, { color: colors.danger }]}>{notice}</Text> : null}
        </Card>
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
  heading: {
    ...typeScale.bodyStrong,
  },
  card: {
    gap: spacing.sm,
  },
  preview: {
    gap: spacing.sm,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
});
