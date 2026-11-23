import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * PDF export. The document is printed from the same HTML the preview shows, so
 * the file and the preview cannot drift, and nothing is rendered on a server.
 * The printer writes a random cache name, so the file is moved to the document
 * number first: a client receives "INV-0001.pdf", not "print-8f2c.pdf".
 */

async function namedFile(uri: string, fileName: string): Promise<string> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) return uri;

  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '-');
  const separator = directory.endsWith('/') ? '' : '/';
  const target = `${directory}${separator}${safeName}`;

  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: target });
    return target;
  } catch {
    // Sharing the printer's own file is better than failing to share at all.
    return uri;
  }
}

export async function shareInvoicePdf(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(await namedFile(uri, fileName), {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: fileName,
  });
}

export async function printInvoiceHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}
