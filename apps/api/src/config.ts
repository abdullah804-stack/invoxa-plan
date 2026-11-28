import { DEFAULT_DEEPSEEK_MODEL, DEFAULT_GEMINI_MODEL, type AiProvider } from './services/ai.js';

export interface RateLimits {
  /** General API limit per minute per user. */
  generalMax: number;
  /** Register and login limit per minute per IP. */
  authMax: number;
}

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  /** At least 32 characters. There is no fallback value. */
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  jobSecret?: string;
  aiDailyLimit: number;
  /** Which provider writes draft lines and refines text. Receipts and voice always use Gemini. */
  aiProvider: AiProvider;
  geminiApiKey?: string;
  geminiModel: string;
  deepseekApiKey?: string;
  deepseekModel: string;
  rateLimits: RateLimits;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const MIN_JWT_SECRET_LENGTH = 32;
export const JWT_EXPIRY = '7d';

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new ConfigError(`${key} is required`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${key} must be a non-negative integer`);
  }
  return value;
}

/**
 * Validates startup configuration. The server calls this before it listens and
 * exits on failure, so a missing or short JWT_SECRET can never fall back to a
 * default signing key.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const jwtSecret = env['JWT_SECRET']?.trim() ?? '';
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigError(
      `JWT_SECRET is required at startup and must be at least ${MIN_JWT_SECRET_LENGTH} characters. No fallback value is used.`,
    );
  }

  const mongoUri = required(env, 'MONGODB_URI');
  const nodeEnv = (env['NODE_ENV']?.trim() || 'development') as ApiConfig['nodeEnv'];
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new ConfigError('NODE_ENV must be development, test or production');
  }

  const port = intFromEnv(env, 'PORT', 4000);
  if (port > 65535) {
    throw new ConfigError('PORT must be at most 65535');
  }

  const corsOrigins = (optional(env, 'CORS_ORIGINS') ?? 'http://localhost:8081')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const geminiApiKey = optional(env, 'GEMINI_API_KEY');
  const deepseekApiKey = optional(env, 'DEEPSEEK_API_KEY');
  const requestedProvider = optional(env, 'AI_PROVIDER');
  if (requestedProvider && requestedProvider !== 'gemini' && requestedProvider !== 'deepseek') {
    throw new ConfigError('AI_PROVIDER must be gemini or deepseek');
  }

  // An explicit AI_PROVIDER wins. Otherwise a DeepSeek-only setup uses DeepSeek,
  // and anything else keeps Gemini, which is the only provider that reads photos
  // and audio.
  const aiProvider: AiProvider =
    requestedProvider === 'deepseek'
      ? 'deepseek'
      : requestedProvider === 'gemini'
        ? 'gemini'
        : !geminiApiKey && deepseekApiKey
          ? 'deepseek'
          : 'gemini';

  return {
    nodeEnv,
    port,
    mongoUri,
    jwtSecret,
    jwtExpiresIn: JWT_EXPIRY,
    corsOrigins,
    ...(optional(env, 'JOB_SECRET') ? { jobSecret: optional(env, 'JOB_SECRET') } : {}),
    aiDailyLimit: intFromEnv(env, 'AI_DAILY_LIMIT', 30),
    aiProvider,
    ...(geminiApiKey ? { geminiApiKey } : {}),
    geminiModel: optional(env, 'GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL,
    ...(deepseekApiKey ? { deepseekApiKey } : {}),
    deepseekModel: optional(env, 'DEEPSEEK_MODEL') ?? DEFAULT_DEEPSEEK_MODEL,
    rateLimits: {
      generalMax: intFromEnv(env, 'RATE_LIMIT_MAX', 120),
      authMax: intFromEnv(env, 'RATE_LIMIT_AUTH_MAX', 10),
    },
  };
}
