import type { FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import { errors } from '../errors.js';
import { bearerToken, verifyToken } from './token.js';

/** The owner always comes from the token, never from the body. */
export function authenticate(config: ApiConfig) {
  return async function authenticateRequest(request: FastifyRequest): Promise<void> {
    const token = bearerToken(request);
    if (!token) {
      throw errors.unauthenticated();
    }
    const { sub } = verifyToken(token, config.jwtSecret);
    request.userId = sub;
  };
}
