import { createHash, randomInt } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import {
  INVITE_DAYS,
  acceptInviteSchema,
  can,
  createBusinessSchema,
  inviteInputSchema,
  memberRoleUpdateSchema,
  transferOwnershipSchema,
  type Role,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import { Business } from '../models/business.js';
import { Invite } from '../models/invite.js';
import { Membership } from '../models/membership.js';
import { User } from '../models/user.js';
import { defaultBusinessFields } from '../services/business.js';
import { logActivity } from '../services/activity.js';
import { requireAction, resolveTenant, type TenantContext } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface BusinessRouteOptions {
  config: ApiConfig;
}

/** 8 characters from an alphabet without look-alikes, so a code reads aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newInviteCode(): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function paramId(request: FastifyRequest, key = 'id'): string {
  const value = (request.params as Record<string, string | undefined>)[key] ?? '';
  if (!Types.ObjectId.isValid(value)) {
    throw errors.notFound();
  }
  return value;
}

/** Members of one business, with names resolved in a single query. */
async function membersOf(businessId: string) {
  const memberships = await Membership.find({ business: businessId }).sort({ createdAt: 1 });
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select(
    'name email',
  );
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return memberships.map((membership) => {
    const user = byId.get(String(membership.userId));
    return {
      id: String(membership._id),
      userId: String(membership.userId),
      name: user?.name ?? 'Former member',
      email: user?.email ?? '',
      role: membership.role as Role,
      joinedAt: membership.createdAt ? membership.createdAt.toISOString() : null,
    };
  });
}

async function membershipInBusiness(context: TenantContext, membershipId: string) {
  const membership = await Membership.findOne({ _id: membershipId, business: context.businessId });
  if (!membership) {
    throw errors.notFound();
  }
  return membership;
}

async function ownerCount(businessId: string): Promise<number> {
  return Membership.countDocuments({ business: businessId, role: 'owner' });
}

export const businessRoutes: FastifyPluginAsync<BusinessRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /** The switcher's list: every business the user belongs to, with its role. */
  app.get('/businesses', { preHandler: authenticateRequest }, async (request) => {
    const memberships = await Membership.find({ userId: request.userId }).sort({ createdAt: 1 });
    const ids = memberships.map((membership) => membership.business);
    const businesses = await Business.find({ _id: { $in: ids } }).select('name');
    const byId = new Map(businesses.map((business) => [String(business._id), business]));

    const counts = await Membership.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { business: { $in: ids } } },
      { $group: { _id: '$business', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((row) => [String(row._id), row.count]));

    return {
      businesses: memberships
        .map((membership) => {
          const business = byId.get(String(membership.business));
          if (!business) return null;
          return {
            id: String(business._id),
            name: business.name,
            role: membership.role as Role,
            memberCount: countById.get(String(business._id)) ?? 1,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    };
  });

  /**
   * A second business is a fresh tenant: its own clients, numbering, brand,
   * reminders and reports. The creator is its first owner.
   */
  app.post('/businesses', { preHandler: authenticateRequest }, async (request, reply) => {
    const userId = request.userId as string;
    const input = parseOrThrow(createBusinessSchema, request.body ?? {});

    const business = await Business.create({
      ...defaultBusinessFields(input.name),
      defaultCurrency: input.currency,
      language: input.language,
    });

    try {
      await Membership.create({ userId, business: business._id, role: 'owner' });
    } catch (error) {
      await Business.deleteOne({ _id: business._id });
      throw error;
    }

    await logActivity(
      { businessId: String(business._id), userId, role: 'owner' },
      {
        type: 'business.created',
        summary: `Created ${business.name}`,
        entityId: String(business._id),
        entityLabel: business.name,
      },
    );

    return reply.code(201).send({
      business: { id: String(business._id), name: business.name, role: 'owner' as Role },
    });
  });

  app.get('/members', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'members:read');

    // Pending codes are owner-only; a staff member still sees the people.
    const canManage = can(context.role, 'invites:manage');
    const pending = canManage
      ? await Invite.find({
          business: context.businessId,
          usedAt: { $exists: false },
          revokedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 })
      : [];

    return {
      members: (await membersOf(context.businessId)).map((member) => ({
        ...member,
        isYou: member.userId === context.userId,
      })),
      invites: pending.map((invite) => ({
        id: String(invite._id),
        role: invite.role,
        createdAt: invite.createdAt ? invite.createdAt.toISOString() : null,
        expiresAt: invite.expiresAt.toISOString(),
      })),
    };
  });

  /** The code is returned once, here, and only its hash is stored. */
  app.post('/invites', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'invites:manage');

    const input = parseOrThrow(inviteInputSchema, request.body ?? {});
    const code = newInviteCode();
    const invite = await Invite.create({
      business: context.businessId,
      role: input.role,
      codeHash: hashCode(code),
      createdBy: context.userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    });

    await logActivity(context, {
      type: 'member.invited',
      summary: `Created a ${input.role} invite`,
      entityId: String(invite._id),
    });

    return reply.code(201).send({
      invite: {
        id: String(invite._id),
        role: invite.role,
        code,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
  });

  app.delete('/invites/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'invites:manage');

    const invite = await Invite.findOne({ _id: paramId(request), business: context.businessId });
    if (!invite) {
      throw errors.notFound();
    }
    if (invite.usedAt) {
      throw errors.conflict('That invite has already been used');
    }

    invite.revokedAt = new Date();
    await invite.save();

    await logActivity(context, {
      type: 'invite.revoked',
      summary: 'Revoked an invite',
      entityId: String(invite._id),
    });

    return reply.code(204).send();
  });

  /**
   * Joining is not business-scoped: the code names the business, and an
   * expired, revoked, used or unknown code is the same 404.
   */
  app.post('/invites/accept', { preHandler: authenticateRequest }, async (request) => {
    const input = parseOrThrow(acceptInviteSchema, request.body ?? {});
    const userId = request.userId as string;

    const invite = await Invite.findOne({
      codeHash: hashCode(input.code),
      usedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!invite) {
      throw errors.notFound('That invite code is not valid or has expired');
    }

    const existing = await Membership.findOne({ userId, business: invite.business });
    if (existing) {
      throw errors.conflict('You are already a member of that business');
    }

    const business = await Business.findById(invite.business);
    if (!business) {
      throw errors.notFound('That invite code is not valid or has expired');
    }

    invite.usedAt = new Date();
    invite.usedBy = new Types.ObjectId(userId);
    await invite.save();

    await Membership.create({ userId, business: invite.business, role: invite.role });
    await logActivity(
      { businessId: String(invite.business), userId, role: invite.role as Role },
      {
        type: 'member.joined',
        summary: `Joined as ${invite.role}`,
        entityId: String(business._id),
        entityLabel: business.name,
      },
    );

    return {
      business: {
        id: String(business._id),
        name: business.name,
        role: invite.role as Role,
      },
    };
  });

  /** Owners move people between staff and viewer; ownership moves by transfer. */
  app.put('/members/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'members:manage');

    const membership = await membershipInBusiness(context, paramId(request));
    const input = parseOrThrow(memberRoleUpdateSchema, request.body ?? {});

    if (String(membership.userId) === context.userId) {
      throw errors.conflict('You cannot change your own role');
    }
    if (membership.role === 'owner') {
      throw errors.conflict('Transfer ownership instead of changing an owner role');
    }
    if (membership.role === input.role) {
      return { member: { id: String(membership._id), role: membership.role as Role } };
    }

    const previous = membership.role as Role;
    membership.role = input.role;
    await membership.save();

    const member = (await membersOf(context.businessId)).find(
      (entry) => entry.id === String(membership._id),
    );

    await logActivity(context, {
      type: 'member.role_changed',
      summary: `${member?.name ?? 'A member'} is now ${input.role} (was ${previous})`,
      entityId: String(membership._id),
      entityLabel: member?.name ?? undefined,
    });

    return { member: { id: String(membership._id), role: input.role as Role } };
  });

  app.delete('/members/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);
    requireAction(context, 'members:manage');

    const membership = await membershipInBusiness(context, paramId(request));
    if (String(membership.userId) === context.userId) {
      throw errors.conflict('Use leave business to remove yourself');
    }
    if (membership.role === 'owner') {
      throw errors.conflict('Transfer ownership before removing an owner');
    }

    const removed = (await membersOf(context.businessId)).find(
      (entry) => entry.id === String(membership._id),
    );
    await membership.deleteOne();

    await logActivity(context, {
      type: 'member.removed',
      summary: `Removed ${removed?.name ?? 'a member'}`,
      entityId: String(membership._id),
      entityLabel: removed?.name ?? undefined,
    });

    return reply.code(204).send();
  });

  /** A business always keeps at least one owner, so the last one cannot leave. */
  app.post('/members/leave', { preHandler: authenticateRequest }, async (request, reply) => {
    const context = await resolveTenant(request);

    const membership = await Membership.findOne({
      userId: context.userId,
      business: context.businessId,
    });
    if (!membership) {
      throw errors.notFound();
    }
    if (membership.role === 'owner') {
      if ((await ownerCount(context.businessId)) <= 1) {
        throw errors.conflict(
          'This business needs an owner. Transfer ownership or delete the business.',
        );
      }
    }

    await membership.deleteOne();
    await logActivity(context, { type: 'member.left', summary: 'Left the business' });

    return reply.code(204).send();
  });

  /** Transfer makes the target an owner and the actor staff in one move. */
  app.post('/members/transfer-ownership', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'members:manage');

    const input = parseOrThrow(transferOwnershipSchema, request.body ?? {});
    if (!Types.ObjectId.isValid(input.membershipId)) {
      throw errors.notFound();
    }

    const target = await membershipInBusiness(context, input.membershipId);
    if (String(target.userId) === context.userId) {
      throw errors.conflict('You are already an owner');
    }

    const actor = await Membership.findOne({
      userId: context.userId,
      business: context.businessId,
    });
    if (!actor) {
      throw errors.notFound();
    }

    target.role = 'owner';
    await target.save();
    actor.role = 'staff';
    await actor.save();

    const targetMember = (await membersOf(context.businessId)).find(
      (entry) => entry.id === String(target._id),
    );

    await logActivity(
      { ...context, role: 'staff' },
      {
        type: 'ownership.transferred',
        summary: `Transferred ownership to ${targetMember?.name ?? 'a member'}`,
        entityId: String(target._id),
        entityLabel: targetMember?.name ?? undefined,
      },
    );

    return {
      member: { id: String(target._id), role: 'owner' as Role },
      you: { role: 'staff' as Role },
    };
  });
};
