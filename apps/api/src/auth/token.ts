import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { errors } from '../errors.js';

export interface TokenPayload {
  sub: string;
}

export function signToken(userId: string, secret: string, expiresIn: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn } as jwt.SignOptions);
}

/** Throws UNAUTHENTICATED for a missing, malformed or expired token. */
export function verifyToken(token: string, secret: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw errors.unauthenticated('Your session is not valid');
    }
    return { sub: decoded.sub };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw errors.unauthenticated('Your session has expired');
    }
    throw errors.unauthenticated('Your session is not valid');
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Rate-limit bucketing only: decodes the subject without verifying the
 * signature. Never used to authorise a request.
 */
export function bucketKey(request: FastifyRequest): string {
  const token = bearerToken(request);
  if (token) {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded === 'object' && typeof decoded.sub === 'string') {
      return `user:${decoded.sub}`;
    }
  }
  return `ip:${request.ip}`;
}
