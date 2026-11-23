/**
 * Token storage. Tokens and the session snapshot live in SecureStore on a
 * device. The web build has no SecureStore, so there localStorage is used and
 * an unavailable backend degrades to memory instead of breaking a screen.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memory = new Map<string, string>();

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function readSecure(key: string): Promise<string | null> {
  const web = webStorage();
  if (web) return web.getItem(key);
  if (Platform.OS === 'web') return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function writeSecure(key: string, value: string): Promise<void> {
  const web = webStorage();
  if (web) {
    web.setItem(key, value);
    return;
  }
  if (Platform.OS === 'web') {
    memory.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memory.set(key, value);
  }
}

export async function removeSecure(key: string): Promise<void> {
  const web = webStorage();
  if (web) {
    web.removeItem(key);
    return;
  }
  memory.delete(key);
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing else to clear.
  }
}

export const StorageKeys = {
  token: 'invoxa.token',
  user: 'invoxa.user',
  businesses: 'invoxa.businesses',
  businessId: 'invoxa.businessId',
  theme: 'invoxa.theme',
  /** One-time Gemini notice: prompts go to Google and may train its models. */
  aiConsent: 'invoxa.aiConsent',
} as const;
