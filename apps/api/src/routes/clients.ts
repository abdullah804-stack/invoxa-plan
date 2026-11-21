import type { FastifyPluginAsync } from 'fastify';
import { Types, type FilterQuery } from 'mongoose';
import {
  clientInputSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  normalizeNameKey,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Client, type ClientRecord } from '../models/client.js';
import { Document } from '../models/document.js';
import { escapeRegex } from '../pagination.js';
import { scoped } from '../scoped.js';
import { serializeClient } from '../services/documents.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ClientRouteOptions {
  config: ApiConfig;
}

export const clientRoutes: FastifyPluginAsync<ClientRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/clients', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:read');

    const query = parseOrThrow(clientListQuerySchema, request.query);
    const filter: FilterQuery<ClientRecord> = {};
    if (query.archived !== 'all') {
      filter.archived = query.archived === 'true';
    }
    if (query.q) {
      filter.nameKey = { $regex: escapeRegex(normalizeNameKey(query.q)) };
    }

    const clients = await scoped(Client, context).findSorted(
      filter,
      { nameKey: 1, _id: 1 },
      query.limit,
    );

    return { clients: clients.map(serializeClient) };
  });

  app.post('/clients', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const input = parseOrThrow(clientInputSchema, request.body ?? {});
    const client = await scoped(Client, context).create({
      name: input.name,
      nameKey: normalizeNameKey(input.name),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.taxId ? { taxId: input.taxId } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      archived: false,
    });

    return reply.code(201).send({ client: serializeClient(client) });
  });

  app.put('/clients/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const id = (request.params as { id?: string }).id ?? '';
    if (!Types.ObjectId.isValid(id)) {
      throw errors.notFound();
    }

    const client = await scoped(Client, context).findById(id);
    if (!client) {
      throw errors.notFound();
    }

    const input = parseOrThrow(clientUpdateSchema, request.body ?? {});
    if (input.name !== undefined) {
      client.name = input.name;
      client.nameKey = normalizeNameKey(input.name);
    }
    if (input.email !== undefined) client.email = input.email || undefined;
    if (input.phone !== undefined) client.phone = input.phone || undefined;
    if (input.address !== undefined) client.address = input.address || undefined;
    if (input.taxId !== undefined) client.taxId = input.taxId || undefined;
    if (input.notes !== undefined) client.notes = input.notes || undefined;
    if (input.archived !== undefined) client.archived = input.archived;
    await client.save();

    return { client: serializeClient(client) };
  });

  /**
   * Deleting a client that an issued document references archives it, so the
   * document history stays readable. An unused client is removed for real.
   */
  app.delete('/clients/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:write');

    const id = (request.params as { id?: string }).id ?? '';
    if (!Types.ObjectId.isValid(id)) {
      throw errors.notFound();
    }

    const client = await scoped(Client, context).findById(id);
    if (!client) {
      throw errors.notFound();
    }

    const documents = scoped(Document, context);
    const usedByIssued = await documents.count({ clientId: client._id, status: { $ne: 'draft' } });
    if (usedByIssued > 0) {
      client.archived = true;
      await client.save();
      return reply.code(200).send({ client: serializeClient(client), archived: true });
    }

    // Drafts keep their own client snapshot, so the reference can be cleared.
    await Document.updateMany(
      { business: client.business, clientId: client._id },
      { $unset: { clientId: 1 } },
    );
    await client.deleteOne();

    return reply.code(204).send();
  });
};
