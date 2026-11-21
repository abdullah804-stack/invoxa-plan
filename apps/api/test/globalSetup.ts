import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const URI_FILE = join(import.meta.dirname, '..', '.tmp-mongo-uri');

/**
 * One in-memory MongoDB for the whole suite. The URI is written to a file
 * because Vitest workers are forked processes and a file is the one channel
 * they all see.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const mongod = await MongoMemoryServer.create();
  writeFileSync(URI_FILE, mongod.getUri('invoxa_test'), 'utf8');

  return async () => {
    await mongod.stop();
    rmSync(URI_FILE, { force: true });
  };
}
