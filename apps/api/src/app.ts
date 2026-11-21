import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { ApiConfig } from './config.js';
import { AppError, errorBody } from './errors.js';
import { registerRoutes } from './routes/index.js';
import { bucketKey } from './auth/token.js';
import { stripUnsafeKeysInPlace } from './validation.js';
import './types.js';

/** Health checks and a wake-up ping must never be rate limited away. */
const RATE_LIMIT_EXEMPT = new Set(['/api/v1/health']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export async function buildApp(config: ApiConfig): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    trustProxy: true,
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: 'info',
            // Never log tokens or cookies.
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Business-Id', 'X-Timezone'],
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimits.generalMax,
    timeWindow: '1 minute',
    keyGenerator: (request) => bucketKey(request),
    allowList: (request) => RATE_LIMIT_EXEMPT.has(request.routeOptions.url ?? ''),
    // v10 throws the builder result at the error handler, so it must carry a
    // status code and an Error instance to be reported like every other error.
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error('Too many requests. Try again soon.'), {
        statusCode: 429,
        code: 'RATE_LIMITED',
        after: context.after,
      }),
  });

  // Operator injection: strip $ keys, dotted keys and prototype keys before
  // anything reaches a Zod schema or a Mongo query.
  app.addHook('onRequest', async (request) => {
    stripUnsafeKeysInPlace(request.query);
    stripUnsafeKeysInPlace(request.params);
  });
  app.addHook('preValidation', async (request) => {
    stripUnsafeKeysInPlace(request.body);
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', 'Not found'));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send(errorBody(error.code, error.message, error.details));
    }

    if (error instanceof z.ZodError) {
      return reply.code(400).send(
        errorBody(
          'VALIDATION',
          'Some fields are invalid',
          error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        ),
      );
    }

    const details = isRecord(error) ? error : {};
    const rawStatus = details['statusCode'];
    const rawCode = details['code'];
    const statusCode = typeof rawStatus === 'number' ? rawStatus : undefined;
    const code = typeof rawCode === 'string' ? rawCode : undefined;

    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || statusCode === 413) {
      return reply.code(413).send(errorBody('PAYLOAD_TOO_LARGE', 'That request is too large'));
    }
    if (code === '11000') {
      return reply.code(409).send(errorBody('CONFLICT', 'That already exists'));
    }
    if (statusCode === 429 || code === 'FST_ERR_RATE_LIMIT') {
      return reply.code(429).send(errorBody('RATE_LIMITED', 'Too many requests. Try again soon.'));
    }
    if (details['validation'] || statusCode === 400) {
      return reply.code(400).send(errorBody('VALIDATION', 'Some fields are invalid'));
    }
    if (statusCode === 401) {
      return reply.code(401).send(errorBody('UNAUTHENTICATED', 'Sign in to continue'));
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send(errorBody('SERVER', 'Something went wrong'));
  });

  await registerRoutes(app, config);

  return app;
}
