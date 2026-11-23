/**
 * Privacy for AI prompts. The plan requires that the assistant never receives
 * addresses, emails or invoices: Invoxa attaches no business or client records,
 * and this removes email addresses and links the user may have typed before the
 * prompt is sent. Money amounts are left alone, because they are the point.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /https?:\/\/\S+|www\.\S+/gi;

export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, '[email removed]')
    .replace(URL, '[link removed]')
    .replace(/\s+/g, ' ')
    .trim();
}
