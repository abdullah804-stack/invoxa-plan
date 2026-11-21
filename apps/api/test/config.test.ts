import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const BASE_ENV = { MONGODB_URI: 'mongodb://127.0.0.1:27017/invoxa' };
const VALID_SECRET = 'a'.repeat(32);

describe('startup configuration', () => {
  it('refuses to load without JWT_SECRET', () => {
    expect(() => loadConfig({ ...BASE_ENV })).toThrow(ConfigError);
    expect(() => loadConfig({ ...BASE_ENV })).toThrow(/JWT_SECRET/);
  });

  it('refuses a JWT_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ ...BASE_ENV, JWT_SECRET: 'a'.repeat(31) })).toThrow(
      /at least 32 characters/,
    );
    expect(() => loadConfig({ ...BASE_ENV, JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
  });

  it('accepts a 32 character secret and applies defaults', () => {
    const config = loadConfig({ ...BASE_ENV, JWT_SECRET: VALID_SECRET });

    expect(config.jwtSecret).toBe(VALID_SECRET);
    expect(config.port).toBe(4000);
    expect(config.aiDailyLimit).toBe(30);
    expect(config.corsOrigins).toEqual(['http://localhost:8081']);
    expect(config.rateLimits.generalMax).toBe(120);
    expect(config.rateLimits.authMax).toBe(10);
  });

  it('requires a database URI', () => {
    expect(() => loadConfig({ JWT_SECRET: VALID_SECRET })).toThrow(/MONGODB_URI/);
  });

  it('parses a comma-separated CORS list and rejects a bad port', () => {
    const config = loadConfig({
      ...BASE_ENV,
      JWT_SECRET: VALID_SECRET,
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
    });
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);

    expect(() => loadConfig({ ...BASE_ENV, JWT_SECRET: VALID_SECRET, PORT: 'abc' })).toThrow(
      /PORT/,
    );
  });

  it('the server process exits instead of booting without the secret', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: join(import.meta.dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JWT_SECRET: '',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/invoxa-does-not-exist',
      },
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('JWT_SECRET');
    expect(`${result.stdout}${result.stderr}`).toContain('Refusing to start');
  });
});
