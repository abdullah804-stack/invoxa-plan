import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { ACTIVITY_LIMIT_PER_BUSINESS } from '@invoxa/shared';
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
import { Activity } from '../src/models/activity.js';
import { Invite } from '../src/models/invite.js';
import { Membership } from '../src/models/membership.js';

async function draftAs(account: TestAccount, businessId: string) {
  return testApp
    .request()
    .post('/api/v1/invoices')
    .set(headersFor(account, businessId))
    .send({
      clientUuid: `w13-${randomSuffix()}`,
      docType: 'invoice',
      items: [{ description: 'Design work', quantity: 1, unitPrice: 12_000 }],
      currency: 'USD',
    });
}

let testApp: TestApp;

/** Invites a fresh account into the owner's business and returns its details. */
async function joinBusiness(owner: TestAccount, role: 'staff' | 'viewer') {
  const invite = await testApp
    .request()
    .post('/api/v1/invites')
    .set(headersFor(owner))
    .send({ role });
  expect(invite.status).toBe(201);
  const code = invite.body.invite.code as string;

  const member = await registerAccount(testApp.request, {
    businessName: `Home ${randomSuffix()}`,
  });
  const accepted = await testApp
    .request()
    .post('/api/v1/invites/accept')
    .set(headersFor(member))
    .send({ code });
  expect(accepted.status).toBe(200);

  const team = await testApp.request().get('/api/v1/members').set(headersFor(owner));
  const membership = (team.body.members as { id: string; userId: string }[]).find(
    (entry) => entry.userId === member.userId,
  );
  expect(membership).toBeTruthy();

  return { code, member, membershipId: membership!.id };
}

describe('week 13: multiple businesses, team seats and the activity log', () => {
  let app: FastifyInstance;
  let owner: TestAccount;

  beforeAll(async () => {
    await connectTestDb();
    testApp = await makeApp();
    app = testApp.app;
  });

  beforeEach(async () => {
    await resetTestDb();
    owner = await registerAccount(testApp.request, { businessName: 'Week Thirteen Ltd' });
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  it('creates a second business with its own clients and numbering', async () => {
    const created = await testApp
      .request()
      .post('/api/v1/businesses')
      .set(headersFor(owner))
      .send({ name: 'Second Shop' });
    expect(created.status).toBe(201);
    expect(created.body.business.role).toBe('owner');
    const secondId = created.body.business.id as string;

    expect(secondId).not.toBe(owner.businessId);

    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'First Shop Client' });
    expect(client.status).toBe(201);

    const secondClients = await testApp
      .request()
      .get('/api/v1/clients')
      .set(headersFor(owner, secondId));
    expect(secondClients.status).toBe(200);
    expect(secondClients.body.clients).toEqual([]);

    const firstDraft = await draftAs(owner, owner.businessId);
    const secondDraft = await draftAs(owner, secondId);
    expect(firstDraft.status).toBe(201);
    expect(secondDraft.status).toBe(201);

    const firstIssue = await testApp
      .request()
      .post(`/api/v1/invoices/${firstDraft.body.document.id}/issue`)
      .set(headersFor(owner))
      .send({});
    const secondIssue = await testApp
      .request()
      .post(`/api/v1/invoices/${secondDraft.body.document.id}/issue`)
      .set(headersFor(owner, secondId))
      .send({});

    // Numbering is per business: both start at one.
    expect(firstIssue.body.document.number).toBe('INV-0001');
    expect(secondIssue.body.document.number).toBe('INV-0001');

    const list = await testApp.request().get('/api/v1/businesses').set(headersFor(owner));
    expect(list.status).toBe(200);
    expect(list.body.businesses).toHaveLength(2);
    expect(list.body.businesses.map((entry: { role: string }) => entry.role)).toEqual([
      'owner',
      'owner',
    ]);
  });

  it('lets an invited staff member issue an invoice, and a code works once', async () => {
    const { code, member } = await joinBusiness(owner, 'staff');

    const draft = await draftAs(member, owner.businessId);
    expect(draft.status).toBe(201);
    const issued = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(member, owner.businessId))
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body.document.number).toBe('INV-0001');

    // A second person cannot reuse the same code.
    const other = await registerAccount(testApp.request, { businessName: 'Other Ltd' });
    const reused = await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(other))
      .send({ code });
    expect(reused.status).toBe(404);

    // A current member cannot join again with a fresh code either.
    const secondInvite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'staff' });
    const again = await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(member))
      .send({ code: secondInvite.body.invite.code });
    expect(again.status).toBe(409);

    const team = await testApp.request().get('/api/v1/members').set(headersFor(owner));
    expect(team.body.members).toHaveLength(2);
    expect(
      (team.body.members as { role: string }[]).filter((entry) => entry.role === 'owner'),
    ).toHaveLength(1);
  });

  it('stops a viewer issuing, writing and managing the team', async () => {
    const { member } = await joinBusiness(owner, 'viewer');
    const draft = await draftAs(owner, owner.businessId);

    const issue = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(member, owner.businessId))
      .send({});
    expect(issue.status).toBe(403);

    const client = await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(member, owner.businessId))
      .send({ name: 'Viewer Client' });
    expect(client.status).toBe(403);

    const invite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(member, owner.businessId))
      .send({ role: 'staff' });
    expect(invite.status).toBe(403);

    const activity = await testApp
      .request()
      .get('/api/v1/activity')
      .set(headersFor(member, owner.businessId));
    expect(activity.status).toBe(403);

    // Reading is allowed, so the viewer still sees the documents.
    const documents = await testApp
      .request()
      .get('/api/v1/invoices')
      .set(headersFor(member, owner.businessId));
    expect(documents.status).toBe(200);

    const staff = await joinBusiness(owner, 'staff');
    const staffInvite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(staff.member, owner.businessId))
      .send({ role: 'viewer' });
    expect(staffInvite.status).toBe(403);
  });

  it('returns 404 for another business, never 403', async () => {
    const stranger = await registerAccount(testApp.request, { businessName: 'Stranger Ltd' });

    for (const path of ['/api/v1/clients', '/api/v1/members', '/api/v1/activity']) {
      const response = await testApp
        .request()
        .get(path)
        .set(headersFor(stranger, owner.businessId));
      expect(response.status).toBe(404);
    }

    const draft = await draftAs(owner, owner.businessId);
    const foreignIssue = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(stranger, owner.businessId))
      .send({});
    expect(foreignIssue.status).toBe(404);
  });

  it('applies a role change to the very next request', async () => {
    const { member, membershipId } = await joinBusiness(owner, 'staff');
    const draft = await draftAs(owner, owner.businessId);

    const firstTry = await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(member, owner.businessId))
      .send({});
    expect(firstTry.status).toBe(200);

    const demoted = await testApp
      .request()
      .put(`/api/v1/members/${membershipId}`)
      .set(headersFor(owner))
      .send({ role: 'viewer' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.member.role).toBe('viewer');

    const secondDraft = await draftAs(owner, owner.businessId);
    const blocked = await testApp
      .request()
      .post(`/api/v1/invoices/${secondDraft.body.document.id}/issue`)
      .set(headersFor(member, owner.businessId))
      .send({});
    expect(blocked.status).toBe(403);

    const own = await testApp.request().get('/api/v1/members').set(headersFor(owner));
    const ownMembership = (own.body.members as { id: string; isYou: boolean }[]).find(
      (entry) => entry.isYou,
    );
    const selfChange = await testApp
      .request()
      .put(`/api/v1/members/${ownMembership!.id}`)
      .set(headersFor(owner))
      .send({ role: 'viewer' });
    expect(selfChange.status).toBe(409);
  });

  it('always keeps at least one owner', async () => {
    const own = await testApp.request().get('/api/v1/members').set(headersFor(owner));
    const ownMembership = (own.body.members as { id: string; isYou: boolean }[]).find(
      (entry) => entry.isYou,
    );

    const leave = await testApp
      .request()
      .post('/api/v1/members/leave')
      .set(headersFor(owner))
      .send({});
    expect(leave.status).toBe(409);

    const removeSelf = await testApp
      .request()
      .delete(`/api/v1/members/${ownMembership!.id}`)
      .set(headersFor(owner));
    expect(removeSelf.status).toBe(409);

    const { member, membershipId } = await joinBusiness(owner, 'staff');
    const transfer = await testApp
      .request()
      .post('/api/v1/members/transfer-ownership')
      .set(headersFor(owner))
      .send({ membershipId });
    expect(transfer.status).toBe(200);
    expect(transfer.body.member.role).toBe('owner');
    expect(transfer.body.you.role).toBe('staff');

    // The old owner is now staff and cannot invite.
    const oldOwnerInvite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'viewer' });
    expect(oldOwnerInvite.status).toBe(403);

    // The new owner can, and cannot remove themselves as the last owner.
    const newOwnerInvite = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(member, owner.businessId))
      .send({ role: 'viewer' });
    expect(newOwnerInvite.status).toBe(201);

    const newOwnerLeave = await testApp
      .request()
      .post('/api/v1/members/leave')
      .set(headersFor(member, owner.businessId))
      .send({});
    expect(newOwnerLeave.status).toBe(409);
  });

  it('refuses an expired or revoked invite code', async () => {
    const expired = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'staff' });
    expect(expired.body.invite.code).toHaveLength(8);
    expect(expired.body.invite.code).toMatch(/^[A-Z0-9]{8}$/);

    await Invite.updateOne(
      { business: new Types.ObjectId(owner.businessId) },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const late = await registerAccount(testApp.request, { businessName: 'Late Ltd' });
    const expiredTry = await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(late))
      .send({ code: expired.body.invite.code });
    expect(expiredTry.status).toBe(404);

    const revoked = await testApp
      .request()
      .post('/api/v1/invites')
      .set(headersFor(owner))
      .send({ role: 'staff' });
    const revoke = await testApp
      .request()
      .delete(`/api/v1/invites/${revoked.body.invite.id}`)
      .set(headersFor(owner));
    expect(revoke.status).toBe(204);

    const revokedTry = await testApp
      .request()
      .post('/api/v1/invites/accept')
      .set(headersFor(late))
      .send({ code: revoked.body.invite.code });
    expect(revokedTry.status).toBe(404);
  });

  it('records activity, pages it newest first and caps it per business', async () => {
    const draft = await draftAs(owner, owner.businessId);
    await testApp
      .request()
      .post(`/api/v1/invoices/${draft.body.document.id}/issue`)
      .set(headersFor(owner))
      .send({});
    const { member } = await joinBusiness(owner, 'staff');

    const log = await testApp.request().get('/api/v1/activity').set(headersFor(owner));
    expect(log.status).toBe(200);
    const types = (log.body.entries as { type: string }[]).map((entry) => entry.type);
    expect(types).toContain('document.issued');
    expect(types).toContain('member.joined');
    const issuedEntry = (
      log.body.entries as { type: string; actorName: string; actorRole: string }[]
    ).find((entry) => entry.type === 'document.issued');
    expect(issuedEntry).toMatchObject({ actorName: 'Test Owner', actorRole: 'owner' });

    // Staff may read it; the entry says who did what.
    const staffRead = await testApp
      .request()
      .get('/api/v1/activity')
      .set(headersFor(member, owner.businessId));
    expect(staffRead.status).toBe(200);

    const page = await testApp.request().get('/api/v1/activity?limit=1').set(headersFor(owner));
    expect(page.body.entries).toHaveLength(1);
    expect(page.body.nextCursor).toBeTruthy();

    const second = await testApp
      .request()
      .get(`/api/v1/activity?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`)
      .set(headersFor(owner));
    expect(second.body.entries[0].id).not.toBe(page.body.entries[0].id);

    // Fill past the cap, then one new action trims the oldest rows away.
    const business = new Types.ObjectId(owner.businessId);
    const filler = Array.from({ length: ACTIVITY_LIMIT_PER_BUSINESS + 5 }, (_, index) => ({
      business,
      actorId: new Types.ObjectId(owner.userId),
      actorName: 'Filler',
      actorRole: 'owner',
      type: 'business.updated' as const,
      summary: `Filler ${index}`,
    }));
    await Activity.insertMany(filler);
    expect(await Activity.countDocuments({ business })).toBeGreaterThan(
      ACTIVITY_LIMIT_PER_BUSINESS,
    );

    await testApp
      .request()
      .post('/api/v1/clients')
      .set(headersFor(owner))
      .send({ name: 'Cap Client' });

    expect(await Activity.countDocuments({ business })).toBeLessThanOrEqual(
      ACTIVITY_LIMIT_PER_BUSINESS,
    );
  });

  it('keeps a business membership unique per person', async () => {
    const { member } = await joinBusiness(owner, 'staff');
    const duplicates = await Membership.countDocuments({
      userId: new Types.ObjectId(member.userId),
      business: new Types.ObjectId(owner.businessId),
    });
    expect(duplicates).toBe(1);
  });
});
