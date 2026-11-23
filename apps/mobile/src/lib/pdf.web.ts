/**
 * PDF export is a phone feature: printing and sharing use the native print
 * service. The web build says so instead of pretending to work.
 */

const UNAVAILABLE = 'PDF export works in the Android and iOS app.';

export async function shareInvoicePdf(): Promise<void> {
  throw new Error(UNAVAILABLE);
}

export async function printInvoiceHtml(): Promise<void> {
  throw new Error(UNAVAILABLE);
}
