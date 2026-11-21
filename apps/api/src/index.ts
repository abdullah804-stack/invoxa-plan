import { API_BASE_PATH, APP_NAME } from '@invoxa/shared';

/**
 * Placeholder for milestone M2 (week 2): Fastify server, Mongo connection,
 * auth, business scoping. Kept tiny so CI proves the shared package resolves
 * from an app before the server lands.
 */
export const serviceInfo = {
  name: APP_NAME,
  basePath: API_BASE_PATH,
} as const;

export function health(): { status: 'ok'; service: string } {
  return { status: 'ok', service: APP_NAME };
}
