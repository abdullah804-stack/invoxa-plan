import type { FastifyInstance } from 'fastify';
import { API_BASE_PATH } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { activityRoutes } from './activity.js';
import { aiRoutes } from './ai.js';
import { businessRoutes } from './business.js';
import { authRoutes } from './auth.js';
import { backupRoutes } from './backup.js';
import { clientRoutes } from './clients.js';
import { documentRoutes } from './documents.js';
import { expenseRoutes } from './expenses.js';
import { healthRoutes } from './health.js';
import { profileRoutes } from './profile.js';
import { recurringRoutes } from './recurring.js';
import { reminderRoutes } from './reminders.js';
import { projectRoutes } from './projects.js';
import { reportRoutes } from './reports.js';
import { savedItemRoutes } from './savedItems.js';
import { syncRoutes } from './sync.js';

export async function registerRoutes(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { config });
      await api.register(profileRoutes, { config });
      await api.register(businessRoutes, { config });
      await api.register(backupRoutes, { config });
      await api.register(activityRoutes, { config });
      await api.register(clientRoutes, { config });
      await api.register(documentRoutes, { config });
      await api.register(savedItemRoutes, { config });
      await api.register(reportRoutes, { config });
      await api.register(aiRoutes, { config });
      await api.register(recurringRoutes, { config });
      await api.register(reminderRoutes, { config });
      await api.register(expenseRoutes, { config });
      await api.register(projectRoutes, { config });
      await api.register(syncRoutes, { config });
    },
    { prefix: API_BASE_PATH },
  );
}
