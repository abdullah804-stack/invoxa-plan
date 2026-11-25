import type { BackupFile } from './schemas/backup.js';

/**
 * An export can be any size, but the restore route accepts at most 8 MB in one
 * request. Rather than raise that limit until the free API host runs out of
 * memory, the app sends the same file as a series of parts, each under a safe
 * byte budget. Restore already merges, so the sequence is equivalent to one
 * restore: clients first, then the records that point at them.
 *
 * This module is pure and dependency-free so the app, the API tests and any
 * other client split a file the same way.
 */

/** Well under the 8 MB route limit, leaving room for JSON overhead. */
export const BACKUP_PART_BYTES = 6 * 1024 * 1024;

export interface BackupUploadPart extends BackupFile {
  /** The app labels each part so one restore logs one activity row. */
  part: { index: number; total: number };
}

/**
 * Collection order is a dependency order: a project, document or time entry
 * looks up the client or project restored before it, and a recurring schedule
 * looks up its source document.
 */
const COLLECTIONS = [
  'clients',
  'projects',
  'documents',
  'recurring',
  'expenses',
  'timeEntries',
  'savedItems',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** UTF-8 byte length without Buffer, so React Native can use this too. */
export function utf8Size(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function chunkBytes(chunk: Record<string, unknown>): number {
  return utf8Size(JSON.stringify(chunk));
}

/**
 * Splits one exported file into parts small enough to upload. A single record
 * larger than the budget is refused with a clear error rather than split,
 * because a partial record is not a record. With the current schema maxima
 * (500 lines, 2 MB images) that cannot happen.
 */
export function splitBackupForUpload(
  file: unknown,
  maxBytes: number = BACKUP_PART_BYTES,
): BackupUploadPart[] {
  if (!isRecord(file)) {
    // Not a backup shape at all: hand it to the server so its schema explains why.
    return [file as unknown as BackupUploadPart];
  }

  if (!Number.isFinite(maxBytes) || maxBytes < 64 * 1024) {
    throw new Error('A backup part must allow at least 64 KB');
  }
  const budget = maxBytes - 1024;

  const base: Record<string, unknown> = {};
  for (const key of ['version', 'exportedAt'] as const) {
    if (file[key] !== undefined) base[key] = file[key];
  }

  const chunks: Record<string, unknown>[] = [];

  for (const key of COLLECTIONS) {
    const rows = Array.isArray(file[key]) ? (file[key] as unknown[]) : [];
    let current: Record<string, unknown> | null = null;
    let used = 0;

    for (const row of rows) {
      const rowBytes = utf8Size(JSON.stringify(row)) + 1;
      if (rowBytes > budget - 1024) {
        throw new Error(`One ${key} record is too large for a single upload part`);
      }

      if (!current || used + rowBytes > budget) {
        if (current) chunks.push(current);
        current = { ...base, [key]: [] };
        // Count the wrapper so the first row cannot tip a part over the budget.
        used = chunkBytes(current) + 1;
      }

      (current[key] as unknown[]).push(row);
      used += rowBytes;
    }

    if (current) chunks.push(current);
  }

  if (file['business'] !== undefined) {
    const withSettings = { ...base, business: file['business'] };
    if (chunkBytes(withSettings) > budget) {
      throw new Error('The business settings are too large for a single upload part');
    }
    chunks.push(withSettings);
  }

  // Images go last, one per part: each can be up to 2 MB on its own.
  const assets = file['brandAssets'];
  if (isRecord(assets)) {
    for (const kind of ['logo', 'signature'] as const) {
      if (typeof assets[kind] === 'string') {
        chunks.push({ ...base, brandAssets: { [kind]: assets[kind] } });
      }
    }
  }

  // An empty backup still gets one part, so the flow stays the same.
  if (chunks.length === 0) chunks.push({ ...base });

  return chunks.map(
    (chunk, index) =>
      ({
        ...chunk,
        part: { index: index + 1, total: chunks.length },
      }) as unknown as BackupUploadPart,
  );
}
