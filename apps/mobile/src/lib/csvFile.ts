import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Saving a CSV. The file already has its BOM from the server. On the phone it is
 * written to the cache and offered through the share sheet (Files, Drive, mail);
 * on the web it is a normal download, because a share sheet does not exist there.
 */
export async function shareCsv(text: string, fileName: string): Promise<void> {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '-');

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('This device has no storage for the file.');
  const target = `${directory}${directory.endsWith('/') ? '' : '/'}${safeName}`;
  await FileSystem.writeAsStringAsync(target, text, { encoding: FileSystem.EncodingType.UTF8 });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(target, {
    mimeType: 'text/csv',
    dialogTitle: safeName,
    UTI: 'public.comma-separated-values-text',
  });
}
