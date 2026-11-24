import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const URI_FILE = join(import.meta.dirname, '..', '.tmp-mongo-uri');

/**
 * MongoDB's in-memory data lives under the repo instead of the system temp
 * directory. The repo is on D: here, so a full C: drive cannot fail the suite
 * with "No space left on device"; CI is unaffected.
 */
const LOCAL_TMP = join(import.meta.dirname, '..', '..', '..', '.tmp-test');

/**
 * One in-memory MongoDB for the whole suite. The URI is written to a file
 * because Vitest workers are forked processes and a file is the one channel
 * they all see.
 */
export default async function setup(): Promise<() => Promise<void>> {
  try {
    rmSync(LOCAL_TMP, { recursive: true, force: true });
  } catch {
    // A stale lock from a killed test run must not stop the suite.
  }
  mkdirSync(LOCAL_TMP, { recursive: true });
  process.env['TEMP'] = LOCAL_TMP;
  process.env['TMP'] = LOCAL_TMP;

  const mongod = await MongoMemoryServer.create();
  writeFileSync(URI_FILE, mongod.getUri('invoxa_test'), 'utf8');

  return async () => {
    await mongod.stop();
    rmSync(URI_FILE, { force: true });
    rmSync(LOCAL_TMP, { recursive: true, force: true });
  };
}
