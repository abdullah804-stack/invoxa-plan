import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * PDF export. The document is printed from the same HTML the preview shows, so
 * the file and the preview cannot drift, and nothing is rendered on a server.
 */

export async function shareInvoicePdf(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: fileName,
  });
}

export async function printInvoiceHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}
