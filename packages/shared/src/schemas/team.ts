import { z } from 'zod';
import { languageSchema, optionalText } from './common.js';
import { currencySchema } from './enums.js';

/**
 * One person can belong to several businesses, each with its own clients,
 * numbering, brand, reminders and reports. A second business is created by its
 * owner; everyone else joins with an invite code.
 */

export const INVITE_CODE_LENGTH = 8;
/** An unused code stops working after a week. */
export const INVITE_DAYS = 7;
/** The log keeps the newest entries only, so the free database stays small. */
export const ACTIVITY_LIMIT_PER_BUSINESS = 250;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, 'Add a business name').max(200),
  currency: currencySchema.default('USD'),
  language: languageSchema,
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

/** Owners invite staff and viewers; a second owner is made by transferring. */
export const inviteRoleSchema = z.enum(['staff', 'viewer']);

export const inviteInputSchema = z.object({
  role: inviteRoleSchema.default('staff'),
});

export type InviteInput = z.infer<typeof inviteInputSchema>;

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, 'Invite codes are 8 letters or numbers');

export const acceptInviteSchema = z.object({ code: inviteCodeSchema });

export const memberRoleUpdateSchema = z.object({ role: inviteRoleSchema });

export const transferOwnershipSchema = z.object({
  membershipId: z.string().trim().min(1).max(64),
});

export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalText(500),
});

export const ACTIVITY_TYPES = [
  'document.created',
  'document.issued',
  'document.voided',
  'payment.recorded',
  'late_fee.added',
  'client.added',
  'expense.added',
  'time.logged',
  'business.created',
  'business.updated',
  'brand.updated',
  'member.invited',
  'invite.revoked',
  'member.joined',
  'member.role_changed',
  'member.removed',
  'member.left',
  'ownership.transferred',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activityTypeSchema = z.enum(ACTIVITY_TYPES);

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  'document.created': 'Draft created',
  'document.issued': 'Document issued',
  'document.voided': 'Document voided',
  'payment.recorded': 'Payment recorded',
  'late_fee.added': 'Late fee added',
  'client.added': 'Client added',
  'expense.added': 'Expense added',
  'time.logged': 'Time logged',
  'business.created': 'Business created',
  'business.updated': 'Business updated',
  'brand.updated': 'Brand updated',
  'member.invited': 'Invite created',
  'invite.revoked': 'Invite revoked',
  'member.joined': 'Member joined',
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'member.left': 'Member left',
  'ownership.transferred': 'Ownership transferred',
};
