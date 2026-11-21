import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { savedItemInputSchema } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { SavedItem } from '../models/savedItem.js';
import { scoped } from '../scoped.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface SavedItemRouteOptions {
  config: ApiConfig;
}

function serializeSavedItem(item: {
  _id: unknown;
  description: string;
  unitPrice: number;
  currency: string;
}) {
  return {
    id: String(item._id),
    description: item.description,
    unitPrice: item.unitPrice,
    currency: item.currency,
  };
}

export const savedItemRoutes: FastifyPluginAsync<SavedItemRouteOptions> = async (
  app,
  { config },
) => {
  const authenticateRequest = authenticate(config);

  app.get('/saved-items', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const items = await scoped(SavedItem, context).findSorted({}, { createdAt: -1 }, 200);
    return { savedItems: items.map(serializeSavedItem) };
  });

  app.post('/saved-items', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'savedItems:write');

    const input = parseOrThrow(savedItemInputSchema, request.body ?? {});
    const item = await scoped(SavedItem, context).create({
      description: input.description,
      unitPrice: input.unitPrice,
      currency: input.currency,
    });

    return reply.code(201).send({ savedItem: serializeSavedItem(item) });
  });

  app.delete('/saved-items/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'savedItems:write');

    const id = (request.params as { id?: string }).id ?? '';
    if (!Types.ObjectId.isValid(id)) {
      throw errors.notFound();
    }

    const deleted = await scoped(SavedItem, context).deleteById(id);
    if (!deleted) {
      throw errors.notFound();
    }

    return reply.code(204).send();
  });
};
