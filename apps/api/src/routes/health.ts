import type { FastifyPluginAsync } from 'fastify';

/** No auth and no database call, so a host health check never depends on Mongo. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'invoxa-api',
  }));
};
