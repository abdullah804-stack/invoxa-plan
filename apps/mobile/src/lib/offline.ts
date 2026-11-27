import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ApiError } from '../api/client';
import type { DocumentDraftBody } from '../api/types';

/**
 * Offline drafts (plan week 10).
 *
 * A draft written with no signal is kept on the device with the same
 * device-generated clientUuid the server deduplicates on, plus the updatedAt it
 * was based on. When a connection comes back the queue goes to POST
 * /sync/invoices, which creates or updates each draft once and reports a
 * conflict instead of overwriting a newer server copy.
 *
 * The queue and the read-only caches are small JSON files in the app's document
 * directory (localStorage on web). Nothing secret is stored: no token, no key.
 */

export interface QueuedDraft {
  clientUuid: string;
  docType: 'invoice' | 'estimate' | 'credit_note';
  /** The server updatedAt this edit started from; null for a new draft. */
  baseUpdatedAt: string | null;
  payload: DocumentDraftBody;
  queuedAt: string;
  /**
   * Set when the server refused this draft because it changed elsewhere. The
   * draft stays queued until the user keeps the phone copy or discards it.
   */
  conflict?: QueuedConflict;
}

/** What the server held when it refused the phone copy, so the user can compare. */
export interface QueuedConflict {
  message: string;
  detectedAt: string;
  serverUpdatedAt: string | null;
  serverDocumentId: string | null;
  serverNumber: string | null;
  serverStatus: string | null;
  serverTotal: number | null;
}

const QUEUE_PREFIX = '@invoxa/queue';
const CACHE_PREFIX = '@invoxa/cache';

function safeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

function webStorage(): Storage | null {
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return candidate ?? null;
}

async function readText(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) return null;
  try {
    return await FileSystem.readAsStringAsync(`${directory}${safeKey(key)}.json`);
  } catch {
    return null;
  }
}

async function writeText(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      webStorage()?.setItem(key, value);
    } catch {
      // Private mode with a full quota: the draft still lives in the form.
    }
    return;
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) return;
  try {
    await FileSystem.writeAsStringAsync(`${directory}${safeKey(key)}.json`, value);
  } catch {
    // Storage is best effort; a failed write must never crash a save.
  }
}

async function removeKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      webStorage()?.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) return;
  try {
    await FileSystem.deleteAsync(`${directory}${safeKey(key)}.json`, { idempotent: true });
  } catch {
    // ignore
  }
}

function queueKey(businessId: string): string {
  return `${QUEUE_PREFIX}/${businessId}`;
}

export async function readQueue(businessId: string): Promise<QueuedDraft[]> {
  const raw = await readText(queueKey(businessId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedDraft[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(businessId: string, items: QueuedDraft[]): Promise<void> {
  if (items.length === 0) {
    await removeKey(queueKey(businessId));
    return;
  }
  await writeText(queueKey(businessId), JSON.stringify(items));
}

/** Adds or replaces one queued draft, so editing the same draft off-line is one item. */
export async function enqueueDraft(businessId: string, item: QueuedDraft): Promise<void> {
  const queue = await readQueue(businessId);
  const next = queue.filter((entry) => entry.clientUuid !== item.clientUuid);
  next.push(item);
  await writeQueue(businessId, next);
}

export async function removeQueued(businessId: string, clientUuids: string[]): Promise<void> {
  const remove = new Set(clientUuids);
  const queue = await readQueue(businessId);
  await writeQueue(
    businessId,
    queue.filter((entry) => !remove.has(entry.clientUuid)),
  );
}

/** Records — or clears — why a queued draft is waiting for the user's decision. */
export async function setQueuedConflict(
  businessId: string,
  clientUuid: string,
  conflict: QueuedConflict | null,
): Promise<void> {
  const queue = await readQueue(businessId);
  await writeQueue(
    businessId,
    queue.map((entry) => {
      if (entry.clientUuid !== clientUuid) return entry;
      const { conflict: _previous, ...rest } = entry;
      return conflict ? { ...rest, conflict } : rest;
    }),
  );
}

export async function updateQueuedBase(
  businessId: string,
  clientUuid: string,
  baseUpdatedAt: string | null,
): Promise<void> {
  const queue = await readQueue(businessId);
  await writeQueue(
    businessId,
    queue.map((entry) => (entry.clientUuid === clientUuid ? { ...entry, baseUpdatedAt } : entry)),
  );
}

/** Last successful response for a screen, so lists stay readable with no signal. */
export async function cacheWrite<T>(businessId: string, key: string, value: T): Promise<void> {
  await writeText(`${CACHE_PREFIX}/${businessId}/${key}`, JSON.stringify(value));
}

export async function cacheRead<T>(businessId: string, key: string): Promise<T | null> {
  const raw = await readText(`${CACHE_PREFIX}/${businessId}/${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** A server that cannot be reached right now, as opposed to one that said no. */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isOffline || error.status === 502 || error.status === 503 || error.status === 504;
  }
  return false;
}
