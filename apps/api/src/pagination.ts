import { errors } from './errors.js';

/**
 * Opaque keyset cursors. Paging by skip would get slower and could repeat rows
 * while new documents arrive, so each cursor carries the last row's sort value
 * and id and the next query continues strictly after it.
 */

export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw errors.validation([{ path: 'cursor', message: 'Cursor is not valid' }]);
  }
}

/** Escapes a user search string so it is a literal, not a regex. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
