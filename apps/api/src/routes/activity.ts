import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import {
  ACTIVITY_LIMIT_PER_BUSINESS,
  activityListQuerySchema,
  type ActivityType,
  type Role,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { Activity } from '../models/activity.js';
import { decodeCursor, encodeCursor } from '../pagination.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ActivityRouteOptions {
  config: ApiConfig;
}

/**
 * The business audit trail, newest first. Paging is keyset on the ObjectId, so
 * a new entry arriving mid-scroll cannot duplicate a row.
 */
export const activityRoutes: FastifyPluginAsync<ActivityRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/activity', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'activity:read');

    const query = parseOrThrow(activityListQuerySchema, request.query);
    const cursor = decodeCursor(query.cursor);
    const before = cursor && typeof cursor['id'] === 'string' ? cursor['id'] : undefined;
    if (before && !Types.ObjectId.isValid(before)) {
      return { entries: [], nextCursor: null, limit: ACTIVITY_LIMIT_PER_BUSINESS };
    }

    const entries = await Activity.find({
      business: context.businessId,
      ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}),
    })
      .sort({ _id: -1 })
      .limit(query.limit);

    const last = entries[entries.length - 1];
    const nextCursor =
      entries.length === query.limit && last ? encodeCursor({ id: String(last._id) }) : null;

    return {
      entries: entries.map((entry) => ({
        id: String(entry._id),
        type: entry.type as ActivityType,
        summary: entry.summary,
        actorName: entry.actorName,
        actorRole: entry.actorRole as Role,
        entityId: entry.entityId ? String(entry.entityId) : null,
        entityLabel: entry.entityLabel ?? null,
        createdAt: entry.createdAt ? entry.createdAt.toISOString() : null,
      })),
      nextCursor,
      limit: ACTIVITY_LIMIT_PER_BUSINESS,
    };
  });
};
