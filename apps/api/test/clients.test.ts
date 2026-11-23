import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import type supertest from 'supertest';
import {
  closeTestDb,
  connectTestDb,
  headersFor,
  makeApp,
  randomSuffix,
  registerAccount,
  resetTestDb,
  type TestAccount,
  type TestApp,
} from './helpers.js';
import { Client } from '../src/models/client.js';
import { Membership } from '../src/models/membership.js';

describe('clients', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let owner: TestAccount;
  let request: () => supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
    request = testApp.request;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(request, { businessName: 'Client Studio' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  async function createClient(body: Record<string, unknown>, account = owner) {
    const response = await request().post('/api/v1/clients').set(headersFor(account)).send(body);
    expect(response.status).toBe(201);
    return response.body.client as { id: string; name: string };
  }

  it('stores the details and a normalised name key', async () => {
    const client = await createClient({
      name: '  Café Déjà Vu  ',
      email: ' Accounts@Example.com ',
      phone: '+33 1 23 45 67',
    });

    expect(client.name).toBe('Café Déjà Vu');

    const stored = await Client.findById(client.id);
    expect(stored?.nameKey).toBe('cafe deja vu');
    expect(stored?.email).toBe('accounts@example.com');
  });

  it('updates a client and recomputes the name key', async () => {
    const client = await createClient({ name: 'Old Name' });

    const response = await request()
      .put(`/api/v1/clients/${client.id}`)
      .set(headersFor(owner))
      .send({ name: 'New Name Ltd', notes: 'Pays on time' });

    expect(response.status).toBe(200);
    expect(response.body.client.name).toBe('New Name Ltd');
    expect(response.body.client.notes).toBe('Pays on time');

    const stored = await Client.findById(client.id);
    expect(stored?.nameKey).toBe('new name ltd');
  });

  it('searches clients by normalised name and lists archived separately', async () => {
    const acme = await createClient({ name: 'Acme Trading' });
    await createClient({ name: 'Beta Works' });

    const search = await request().get('/api/v1/clients?q=acme').set(headersFor(owner));
    expect(search.status).toBe(200);
    expect(search.body.clients).toHaveLength(1);
    expect(search.body.clients[0].id).toBe(acme.id);

    await request()
      .put(`/api/v1/clients/${acme.id}`)
      .set(headersFor(owner))
      .send({ archived: true });

    const active = await request().get('/api/v1/clients').set(headersFor(owner));
    expect(active.body.clients).toHaveLength(1);
    expect(active.body.clients[0].name).toBe('Beta Works');

    const archived = await request().get('/api/v1/clients?archived=true').set(headersFor(owner));
    expect(archived.body.clients).toHaveLength(1);
    expect(archived.body.clients[0].name).toBe('Acme Trading');
  });

  it('archives a client used by an issued document and deletes an unused one', async () => {
    const used = await createClient({ name: 'Used Client' });
    const unused = await createClient({ name: 'Unused Client' });

    const draft = await request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `uuid-${randomSuffix()}`,
        docType: 'invoice',
        clientId: used.id,
        items: [{ description: 'Work', quantity: 1, unitPrice: 5000 }],
        currency: 'USD',
      });
    expect(draft.status).toBe(201);

    const issued = await request()
      .post(`/api/v1/invoices/${String(draft.body.document.id)}/issue`)
      .set(headersFor(owner))
      .send({});
    expect(issued.status).toBe(200);

    const archive = await request().delete(`/api/v1/clients/${used.id}`).set(headersFor(owner));
    expect(archive.status).toBe(200);
    expect(archive.body.archived).toBe(true);
    expect(archive.body.client.archived).toBe(true);

    const stillThere = await Client.findById(used.id);
    expect(stillThere).not.toBeNull();

    const remove = await request().delete(`/api/v1/clients/${unused.id}`).set(headersFor(owner));
    expect(remove.status).toBe(204);
    expect(await Client.findById(unused.id)).toBeNull();
  });

  it('shows the money owed by one client, per currency', async () => {
    const client = await createClient({ name: 'Summary Client' });

    const draft = await request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `uuid-${randomSuffix()}`,
        docType: 'invoice',
        clientId: client.id,
        items: [{ description: 'Retainer', quantity: 1, unitPrice: 500000 }],
        currency: 'USD',
      });
    expect(draft.status).toBe(201);
    const issued = await request()
      .post(`/api/v1/invoices/${String(draft.body.document.id)}/issue`)
      .set(headersFor(owner))
      .send({});
    expect(issued.status).toBe(200);

    const payment = await request()
      .post(`/api/v1/invoices/${String(draft.body.document.id)}/payments`)
      .set(headersFor(owner))
      .send({ amount: 200000, method: 'bank_transfer' });
    expect(payment.status).toBe(201);

    // A draft for the same client must not count as billed.
    await request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `uuid-${randomSuffix()}`,
        docType: 'invoice',
        clientId: client.id,
        items: [{ description: 'Unsent', quantity: 1, unitPrice: 99900 }],
        currency: 'USD',
      });

    const detail = await request().get(`/api/v1/clients/${client.id}`).set(headersFor(owner));
    expect(detail.status).toBe(200);
    expect(detail.body.client.name).toBe('Summary Client');
    expect(detail.body.currencies).toHaveLength(1);
    expect(detail.body.currencies[0]).toMatchObject({
      currency: 'USD',
      billed: 500000,
      paid: 200000,
      outstanding: 300000,
    });
    expect(detail.body.documents).toHaveLength(2);

    const mallory = await registerAccount(request, { businessName: 'Other Ltd' });
    const foreign = await request()
      .get(`/api/v1/clients/${client.id}`)
      .set(headersFor(mallory, owner.businessId));
    expect(foreign.status).toBe(404);
  });

  it('keeps clients inside their business', async () => {
    const mallory = await registerAccount(request, { businessName: 'Mallory Ltd' });
    const client = await createClient({ name: 'Private Client' });

    const list = await request().get('/api/v1/clients').set(headersFor(mallory));
    expect(list.body.clients).toHaveLength(0);

    const read = await request()
      .get('/api/v1/clients?q=private')
      .set(headersFor(mallory, owner.businessId));
    expect(read.status).toBe(404);

    const update = await request()
      .put(`/api/v1/clients/${client.id}`)
      .set(headersFor(mallory))
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(404);

    const remove = await request().delete(`/api/v1/clients/${client.id}`).set(headersFor(mallory));
    expect(remove.status).toBe(404);

    const stored = await Client.findById(client.id);
    expect(stored?.name).toBe('Private Client');
  });

  it('refuses a viewer a new client but lets them read the book', async () => {
    const viewer = await registerAccount(request, { businessName: 'Viewer Ltd' });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });

    const create = await request()
      .post('/api/v1/clients')
      .set(headersFor(viewer, owner.businessId))
      .send({ name: 'Viewer Client' });
    expect(create.status).toBe(403);

    const list = await request().get('/api/v1/clients').set(headersFor(viewer, owner.businessId));
    expect(list.status).toBe(200);
  });
});
