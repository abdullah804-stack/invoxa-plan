import type { z, ZodType } from 'zod';
import { errors, type ErrorDetail } from './errors.js';

/** Every body, query and param is parsed through here with a shared schema. */
export function parseOrThrow<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw errors.validation(details);
  }
  return result.data;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isUnsafeKey(key: string): boolean {
  return key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key);
}

/**
 * Removes keys that start with "$" or contain "." from a body or query, plus
 * prototype-pollution keys. MongoDB would otherwise treat {"$gt": ""} as an
 * operator instead of data.
 */
/** In-place variant for Fastify's parsed body, query and params objects. */
export function stripUnsafeKeysInPlace(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripUnsafeKeysInPlace(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (isUnsafeKey(key)) {
      delete record[key];
      continue;
    }
    stripUnsafeKeysInPlace(record[key]);
  }
}

export function stripUnsafeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsafeKeys(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (isUnsafeKey(key)) continue;
      clean[key] = stripUnsafeKeys(source[key]);
    }
    return clean as T;
  }
  return value;
}
