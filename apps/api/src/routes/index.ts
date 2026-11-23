import type { FastifyInstance } from 'fastify';
import { API_BASE_PATH } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { aiRoutes } from './ai.js';
import { authRoutes } from './auth.js';
import { clientRoutes } from './clients.js';
import { documentRoutes } from './documents.js';
import { healthRoutes } from './health.js';
import { profileRoutes } from './profile.js';
import { reportRoutes } from './reports.js';
import { savedItemRoutes } from './savedItems.js';

export async function registerRoutes(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { config });
      await api.register(profileRoutes, { config });
      await api.register(clientRoutes, { config });
      await api.register(documentRoutes, { config });
      await api.register(savedItemRoutes, { config });
      await api.register(reportRoutes, { config });
      await api.register(aiRoutes, { config });
    },
    { prefix: API_BASE_PATH },
  );
}
