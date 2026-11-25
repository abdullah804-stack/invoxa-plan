import type { FastifyPluginAsync } from 'fastify';
import { deleteAccountSchema, loginSchema, registerSchema, type Role } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { errors } from '../errors.js';
import { authenticate } from '../auth/authenticate.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/token.js';
import { Business } from '../models/business.js';
import { Membership } from '../models/membership.js';
import { User } from '../models/user.js';
import { defaultBusinessFields } from '../services/business.js';
import { purgeBusiness } from '../services/purge.js';
import { parseOrThrow } from '../validation.js';

interface AuthRouteOptions {
  config: ApiConfig;
}

function serializeUser(user: { _id: unknown; name: string; email: string; createdAt?: Date }) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
  };
}

async function businessesFor(userId: string) {
  const memberships = await Membership.find({ userId }).sort({ createdAt: 1 });
  const ids = memberships.map((membership) => membership.business);
  const businesses = await Business.find({ _id: { $in: ids } });
  const byId = new Map(businesses.map((business) => [String(business._id), business]));

  return memberships
    .map((membership) => {
      const business = byId.get(String(membership.business));
      if (!business) return null;
      return {
        id: String(business._id),
        name: business.name,
        role: membership.role as Role,
      };
    })
    .filter((entry): entry is { id: string; name: string; role: Role } => entry !== null);
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  /** Registration creates a user, one business and an owner membership. */
  app.post(
    '/auth/register',
    { config: { rateLimit: { max: config.rateLimits.authMax, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parseOrThrow(registerSchema, request.body);

      const existing = await User.findOne({ email: input.email });
      if (existing) {
        throw errors.conflict('An account with that email already exists');
      }

      const passwordHash = await hashPassword(input.password);
      const user = await User.create({
        name: input.name,
        email: input.email,
        passwordHash,
      });

      let business;
      try {
        business = await Business.create(defaultBusinessFields(input.businessName ?? input.name));
        await Membership.create({
          userId: user._id,
          business: business._id,
          role: 'owner',
        });
      } catch (error) {
        // Never leave a user without a business behind.
        await User.deleteOne({ _id: user._id });
        throw error;
      }

      const token = signToken(String(user._id), config.jwtSecret, config.jwtExpiresIn);

      return reply.code(201).send({
        token,
        user: serializeUser(user),
        business: { id: String(business._id), name: business.name, role: 'owner' as Role },
      });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: config.rateLimits.authMax, timeWindow: '1 minute' } } },
    async (request) => {
      const input = parseOrThrow(loginSchema, request.body);

      const user = await User.findOne({ email: input.email }).select('+passwordHash');
      const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;

      if (!user || !valid) {
        // The same message for a wrong email and a wrong password.
        throw errors.unauthenticated('Wrong email or password');
      }

      return {
        token: signToken(String(user._id), config.jwtSecret, config.jwtExpiresIn),
        user: serializeUser(user),
      };
    },
  );

  app.get('/auth/me', { preHandler: authenticateRequest }, async (request) => {
    const user = await User.findById(request.userId);
    if (!user) {
      throw errors.unauthenticated('Your account no longer exists');
    }

    return {
      user: serializeUser(user),
      businesses: await businessesFor(String(user._id)),
    };
  });

  /** Deleting an account needs the password and removes everything it solely owns. */
  app.delete('/auth/me', { preHandler: authenticateRequest }, async (request, reply) => {
    const input = parseOrThrow(deleteAccountSchema, request.body ?? {});

    const user = await User.findById(request.userId).select('+passwordHash');
    if (!user) {
      throw errors.unauthenticated('Your account no longer exists');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw errors.unauthenticated('Wrong password');
    }

    const memberships = await Membership.find({ userId: user._id });

    for (const membership of memberships) {
      if (membership.role !== 'owner') continue;

      const otherMembers = await Membership.countDocuments({
        business: membership.business,
        userId: { $ne: user._id },
      });
      if (otherMembers > 0) {
        throw errors.conflict(
          'Transfer ownership or remove the other members before deleting your account',
        );
      }

      await purgeBusiness(String(membership.business));
    }

    // Memberships in other people's businesses just go; their data stays.
    await Membership.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    return reply.code(204).send();
  });
};
