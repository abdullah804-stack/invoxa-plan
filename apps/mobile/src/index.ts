import { APP_NAME, APP_TAGLINE, formatMoney } from '@invoxa/shared';

/**
 * Placeholder for milestone M4 (week 4): Expo Router app, theme tokens, auth
 * gate, SecureStore. This proves the shared package imports from the app and
 * that the totals formatter works on the client.
 */
export const appIdentity = { name: APP_NAME, tagline: APP_TAGLINE } as const;

export function previewOutstanding(totalMinor: number, currency: string): string {
  return formatMoney(totalMinor, currency);
}
