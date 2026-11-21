import 'dotenv/config';
import { ConfigError, loadConfig } from './config.js';
import { buildApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db.js';

/**
 * Boot sequence: validate configuration first, so a missing or short
 * JWT_SECRET stops the process before Mongo is touched. There is no fallback
 * signing key and no "development default".
 */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : 'Invalid configuration';
    console.error(`[invoxa-api] Refusing to start: ${message}`);
    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabase(config.mongoUri);
    const app = await buildApp(config);
    await app.listen({ port: config.port, host: '0.0.0.0' });

    const shutdown = async (signal: string): Promise<void> => {
      console.warn(`[invoxa-api] ${signal} received, shutting down`);
      await app.close();
      await disconnectDatabase();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error(`[invoxa-api] Refusing to start: ${message}`);
    process.exitCode = 1;
  }
}

void main();
