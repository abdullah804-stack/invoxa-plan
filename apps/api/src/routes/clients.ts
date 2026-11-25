import type { FastifyPluginAsync } from 'fastify';
import { Types, type FilterQuery } from 'mongoose';
import {
  clientInputSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  computeOutstanding,
  normalizeNameKey,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Client, type ClientRecord } from '../models/client.js';
import { Document } from '../models/document.js';
import { escapeRegex } from '../pagination.js';
import { scoped } from '../scoped.js';
import {
  requestToday,
  serializeClient,
  serializeDocument,
  shownStatusFor,
  totalsFor,
} from '../services/documents.js';
import { logActivity } from '../services/activity.js';
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

  /**
   * One client with the money owed on their issued documents, per currency,
   * plus their recent documents. Drafts and void documents never count.
   */
  app.get('/clients/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'clients:read');

    const id = (request.params as { id?: string }).id ?? '';
    if (!Types.ObjectId.isValid(id)) {
      throw errors.notFound();
    }

    const client = await scoped(Client, context).findById(id);
    if (!client) {
      throw errors.notFound();
    }

    const today = requestToday(request);
    const documents = await scoped(Document, context).find({ clientId: client._id });
    const byCurrency = new Map<
      string,
      { currency: string; billed: number; paid: number; outstanding: number; overdue: number }
    >();

    for (const doc of documents) {
      if (doc.status === 'void' || doc.status === 'draft') continue;
      const totals = doc.totals ?? totalsFor(doc);
      const live = computeOutstanding([
        { total: totals.total, paid: totals.paid, status: doc.status },
      ]);
      const row = byCurrency.get(doc.currency) ?? {
        currency: doc.currency,
        billed: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
      };
      row.billed += live.billed;
      row.paid += live.paid;
      row.outstanding += live.outstanding;
      if (shownStatusFor(doc, today) === 'overdue' && doc.docType === 'invoice') {
        row.overdue += totals.balance;
      }
      byCurrency.set(doc.currency, row);
    }

    return {
      client: serializeClient(client),
      currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      documents: [...documents]
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
        .slice(0, 20)
        .map((doc) => serializeDocument(doc, today)),
    };
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

    await logActivity(context, {
      type: 'client.added',
      summary: `Added ${client.name}`,
      entityId: String(client._id),
      entityLabel: client.name,
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
