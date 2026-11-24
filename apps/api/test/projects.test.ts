import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
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
import { Membership } from '../src/models/membership.js';

const today = () => new Date().toISOString().slice(0, 10);

async function setupProject(testApp: TestApp, owner: TestAccount) {
  const client = await testApp
    .request()
    .post('/api/v1/clients')
    .set(headersFor(owner))
    .send({ name: 'Acme Trading' });

  const project = await testApp.request().post('/api/v1/projects').set(headersFor(owner)).send({
    name: 'Website rebuild',
    clientId: client.body.client.id,
    currency: 'USD',
    hourlyRateMinor: 9500,
    budgetMinor: 500000,
  });

  return { clientId: client.body.client.id as string, project: project.body.project };
}

async function addTime(
  testApp: TestApp,
  owner: TestAccount,
  projectId: string,
  overrides: Record<string, unknown> = {},
) {
  return testApp
    .request()
    .post('/api/v1/time-entries')
    .set(headersFor(owner))
    .send({
      projectId,
      date: today(),
      minutes: 90,
      description: 'Design revisions',
      hourlyRateMinor: 9500,
      ...overrides,
    });
}

describe('projects and tracked time', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(testApp.request, { businessName: 'Projects Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('creates a project for a client and lists it', async () => {
    const { project } = await setupProject(testApp, owner);

    expect(project).toMatchObject({
      name: 'Website rebuild',
      clientName: 'Acme Trading',
      status: 'active',
      currency: 'USD',
      hourlyRateMinor: 9500,
      budgetMinor: 500000,
    });

    const list = await testApp.request().get('/api/v1/projects').set(headersFor(owner));
    expect(list.status).toBe(200);
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0].clientName).toBe('Acme Trading');
  });

  it('totals tracked minutes and their value', async () => {
    const { project } = await setupProject(testApp, owner);
    await addTime(testApp, owner, project.id, { minutes: 90 });
    await addTime(testApp, owner, project.id, { minutes: 30, description: 'Calls' });
    await addTime(testApp, owner, project.id, { minutes: 60, billable: false });

    const detail = await testApp
      .request()
      .get(`/api/v1/projects/${project.id}`)
      .set(headersFor(owner));

    expect(detail.status).toBe(200);
    expect(detail.body.time).toEqual({
      minutes: 180,
      billableMinutes: 120,
      unbilledMinutes: 120,
      valueMinor: 28500,
      unbilledValueMinor: 19000,
    });
    expect(detail.body.entries).toHaveLength(3);
  });

  it('bills unbilled time into one draft and releases it when the draft is deleted', async () => {
    const { project } = await setupProject(testApp, owner);
    await addTime(testApp, owner, project.id, { minutes: 90 });
    await addTime(testApp, owner, project.id, { minutes: 30 });
    const nonBillable = await addTime(testApp, owner, project.id, {
      minutes: 60,
      billable: false,
    });

    const bill = await testApp
      .request()
      .post(`/api/v1/projects/${project.id}/bill`)
      .set(headersFor(owner))
      .send({});

    expect(bill.status).toBe(200);
    const document = bill.body.document;
    expect(document).toMatchObject({
      docType: 'invoice',
      status: 'draft',
      number: null,
      source: 'time',
      clientName: 'Acme Trading',
      projectId: project.id,
    });
    expect(document.items).toHaveLength(1);
    expect(document.items[0]).toMatchObject({
      description: 'Design revisions',
      quantity: 2,
      unitPrice: 9500,
      unit: 'hours',
    });
    expect(document.totals.total).toBe(19000);
    expect(bill.body).toMatchObject({ billedMinutes: 120, entries: 2 });

    // Non-billable time was never on the invoice.
    const stillUnbilled = await testApp
      .request()
      .get('/api/v1/time-entries?unbilled=true')
      .set(headersFor(owner));
    expect(stillUnbilled.body.entries).toHaveLength(0);
    const nonBillableEntry = await testApp
      .request()
      .get(`/api/v1/time-entries?projectId=${project.id}`)
      .set(headersFor(owner));
    expect(
      nonBillableEntry.body.entries.find(
        (entry: { id: string }) => entry.id === nonBillable.body.entry.id,
      ).billable,
    ).toBe(false);

    // Nothing unbilled is left, so a second bill is a plain validation error.
    const again = await testApp
      .request()
      .post(`/api/v1/projects/${project.id}/bill`)
      .set(headersFor(owner))
      .send({});
    expect(again.status).toBe(400);

    // Deleting the draft puts its time back on the unbilled list.
    const removed = await testApp
      .request()
      .delete(`/api/v1/invoices/${document.id}`)
      .set(headersFor(owner));
    expect(removed.status).toBe(204);

    const released = await testApp
      .request()
      .get('/api/v1/time-entries?unbilled=true')
      .set(headersFor(owner));
    expect(released.body.entries).toHaveLength(2);
    expect(released.body.totals.unbilledMinutes).toBe(120);
  });

  it('pulls a project’s unbilled time into a draft and releases it when the link is cleared', async () => {
    const { project, clientId } = await setupProject(testApp, owner);
    await addTime(testApp, owner, project.id, { minutes: 90 });
    await addTime(testApp, owner, project.id, { minutes: 30 });
    await addTime(testApp, owner, project.id, { minutes: 60, billable: false });

    const created = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `editor-${randomSuffix()}`,
        docType: 'invoice',
        clientId,
        projectId: project.id,
        billProjectTime: true,
        items: [{ description: 'Setup fee', quantity: 1, unitPrice: 5000 }],
        currency: 'USD',
      });

    expect(created.status).toBe(201);
    const draft = created.body.document;
    expect(draft.projectId).toBe(project.id);
    expect(draft.items).toHaveLength(2);
    expect(draft.items[1]).toMatchObject({
      description: 'Design revisions',
      quantity: 2,
      unitPrice: 9500,
      unit: 'hours',
    });
    expect(draft.items[1].timeEntryIds).toHaveLength(2);
    expect(draft.totals.total).toBe(24000);

    // Saving the same draft again never bills the same time twice.
    const again = await testApp
      .request()
      .put(`/api/v1/invoices/${draft.id}`)
      .set(headersFor(owner))
      .send({ projectId: project.id, billProjectTime: true });
    expect(again.status).toBe(200);
    expect(again.body.document.items).toHaveLength(2);

    const billed = await testApp
      .request()
      .get('/api/v1/time-entries?unbilled=true')
      .set(headersFor(owner));
    expect(billed.body.entries).toHaveLength(0);

    // Clearing the project drops its lines and puts the time back.
    const cleared = await testApp
      .request()
      .put(`/api/v1/invoices/${draft.id}`)
      .set(headersFor(owner))
      .send({ projectId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.document.projectId).toBeNull();
    expect(cleared.body.document.items).toHaveLength(1);
    expect(cleared.body.document.totals.total).toBe(5000);

    const released = await testApp
      .request()
      .get('/api/v1/time-entries?unbilled=true')
      .set(headersFor(owner));
    expect(released.body.entries).toHaveLength(2);
  });

  it('refuses a draft project in another currency or another business', async () => {
    const { project, clientId } = await setupProject(testApp, owner);
    const mismatch = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(owner))
      .send({
        clientUuid: `editor-${randomSuffix()}`,
        docType: 'invoice',
        clientId,
        projectId: project.id,
        billProjectTime: true,
        items: [{ description: 'Setup fee', quantity: 1, unitPrice: 5000 }],
        currency: 'EUR',
      });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.details[0].path).toBe('projectId');

    const other = await registerAccount(testApp.request, { businessName: 'Other Editor' });
    const foreign = await testApp
      .request()
      .post('/api/v1/invoices')
      .set(headersFor(other))
      .send({
        clientUuid: `editor-${randomSuffix()}`,
        docType: 'invoice',
        projectId: project.id,
        items: [{ description: 'Setup fee', quantity: 1, unitPrice: 5000 }],
        currency: 'USD',
      });
    expect(foreign.status).toBe(404);
  });

  it('refuses to edit or delete time already on an invoice', async () => {
    const { project } = await setupProject(testApp, owner);
    const entry = await addTime(testApp, owner, project.id);
    await testApp
      .request()
      .post(`/api/v1/projects/${project.id}/bill`)
      .set(headersFor(owner))
      .send({});

    const edit = await testApp
      .request()
      .put(`/api/v1/time-entries/${entry.body.entry.id}`)
      .set(headersFor(owner))
      .send({ minutes: 60 });
    expect(edit.status).toBe(409);

    const remove = await testApp
      .request()
      .delete(`/api/v1/time-entries/${entry.body.entry.id}`)
      .set(headersFor(owner));
    expect(remove.status).toBe(409);
  });

  it('lets a viewer read but not write, and keeps projects inside their business', async () => {
    const { project } = await setupProject(testApp, owner);

    const viewer = await registerAccount(testApp.request, {
      businessName: 'Viewer Projects',
      email: `viewer-${randomSuffix()}@example.com`,
    });
    await Membership.create({
      userId: new Types.ObjectId(viewer.userId),
      business: new Types.ObjectId(owner.businessId),
      role: 'viewer',
    });

    const read = await testApp
      .request()
      .get('/api/v1/projects')
      .set(headersFor(viewer, owner.businessId));
    expect(read.status).toBe(200);

    const write = await testApp
      .request()
      .post('/api/v1/time-entries')
      .set(headersFor(viewer, owner.businessId))
      .send({
        projectId: project.id,
        date: today(),
        minutes: 30,
        description: 'Sneaky',
        hourlyRateMinor: 1000,
      });
    expect(write.status).toBe(403);

    const other = await registerAccount(testApp.request, { businessName: 'Other Projects' });
    const foreign = await testApp
      .request()
      .get(`/api/v1/projects/${project.id}`)
      .set(headersFor(other));
    expect(foreign.status).toBe(404);
  });

  it('validates durations and refuses to delete a project with time', async () => {
    const { project } = await setupProject(testApp, owner);
    const bad = await addTime(testApp, owner, project.id, { minutes: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('minutes');

    await addTime(testApp, owner, project.id);
    const deleted = await testApp
      .request()
      .delete(`/api/v1/projects/${project.id}`)
      .set(headersFor(owner));
    expect(deleted.status).toBe(409);
  });
});
