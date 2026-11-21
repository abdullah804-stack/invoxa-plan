import type { FastifyInstance } from 'fastify';
import { API_BASE_PATH } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';
import { profileRoutes } from './profile.js';

export async function registerRoutes(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { config });
      await api.register(profileRoutes, { config });
    },
    { prefix: API_BASE_PATH },
  );
}
