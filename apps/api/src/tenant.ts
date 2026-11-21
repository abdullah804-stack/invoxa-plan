import { Types } from 'mongoose';
import type { FastifyRequest } from 'fastify';
import { can, type Action, type Role } from '@invoxa/shared';
import { errors } from './errors.js';
import { Membership } from './models/membership.js';

export interface TenantContext {
  userId: string;
  businessId: string;
  role: Role;
  membershipId: string;
}

function businessHeader(request: FastifyRequest): string | undefined {
  const header = request.headers['x-business-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || undefined;
}

/**
 * Resolves the active business: X-Business-Id when present, otherwise the
 * user's first business. A non-member gets 404, never 403, so IDs cannot be
 * probed. Every business-scoped route calls this before touching data.
 */
export async function resolveTenant(request: FastifyRequest): Promise<TenantContext> {
  const userId = request.userId;
  if (!userId) {
    throw errors.unauthenticated();
  }

  const requested = businessHeader(request);
  let membership;

  if (requested) {
    if (!Types.ObjectId.isValid(requested)) {
      throw errors.notFound();
    }
    membership = await Membership.findOne({ userId, business: requested });
  } else {
    membership = await Membership.findOne({ userId }).sort({ createdAt: 1 });
  }

  if (!membership) {
    throw errors.notFound();
  }

  return {
    userId,
    businessId: String(membership.business),
    role: membership.role as Role,
    membershipId: String(membership._id),
  };
}

/** A member whose role forbids an action gets 403. */
export function requireAction(context: TenantContext, action: Action): void {
  if (!can(context.role, action)) {
    throw errors.forbidden();
  }
}
