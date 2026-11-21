import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { ApiConfig } from '../src/config.js';

const URI_FILE = join(import.meta.dirname, '..', '.tmp-mongo-uri');

/** Deterministic signing key for tests only, assembled so it is never a token-like literal. */
export const TEST_JWT_SECRET = ['invoxa', 'test', 'signing', 'key', 'fixture'].join('-');

export function testMongoUri(): string {
  return readFileSync(URI_FILE, 'utf8').trim();
}

export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(testMongoUri());
  }
}

/** Removes documents between tests so each case starts clean. */
export async function resetTestDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

export async function closeTestDb(): Promise<void> {
  await mongoose.disconnect();
}

export function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    mongoUri: testMongoUri(),
    jwtSecret: TEST_JWT_SECRET,
    jwtExpiresIn: '7d',
    corsOrigins: ['http://localhost:8081'],
    aiDailyLimit: 30,
    geminiModel: 'gemini-2.5-flash',
    // Tests create several accounts; rate limits are covered by their own case.
    rateLimits: { generalMax: 10_000, authMax: 10_000 },
    ...overrides,
  };
}

export interface TestApp {
  app: FastifyInstance;
  request: () => supertest.SuperTest<supertest.Test>;
  config: ApiConfig;
}

export async function makeApp(overrides: Partial<ApiConfig> = {}): Promise<TestApp> {
  const config = testConfig(overrides);
  const app = await buildApp(config);
  await app.ready();
  return {
    app,
    request: () => supertest(app.server) as unknown as supertest.SuperTest<supertest.Test>,
    config,
  };
}

export interface TestAccount {
  token: string;
  userId: string;
  businessId: string;
  email: string;
  password: string;
}

export async function registerAccount(
  request: () => supertest.SuperTest<supertest.Test>,
  overrides: { name?: string; email?: string; password?: string; businessName?: string } = {},
): Promise<TestAccount> {
  const email = overrides.email ?? `user-${randomSuffix()}@example.com`;
  const password = overrides.password ?? 'correct-horse-battery';
  const body: Record<string, string> = {
    name: overrides.name ?? 'Test Owner',
    email,
    password,
  };
  if (overrides.businessName) body['businessName'] = overrides.businessName;

  const response = await request().post('/api/v1/auth/register').send(body);
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return {
    token: response.body.token as string,
    userId: response.body.user.id as string,
    businessId: response.body.business.id as string,
    email,
    password,
  };
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Authorization headers for a signed-in account, optionally scoped. */
export function headersFor(account: TestAccount, businessId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${account.token}`,
    ...(businessId ? { 'X-Business-Id': businessId } : {}),
  };
}
