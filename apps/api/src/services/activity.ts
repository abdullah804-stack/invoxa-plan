import { Types } from 'mongoose';
import { ACTIVITY_LIMIT_PER_BUSINESS, type ActivityType, type Role } from '@invoxa/shared';
import { Activity } from '../models/activity.js';
import { User } from '../models/user.js';

export interface ActivityInput {
  type: ActivityType;
  summary: string;
  entityId?: string;
  entityLabel?: string;
}

export interface ActivityActor {
  businessId: string;
  userId: string;
  role: Role;
}

/**
 * Records one entry and trims the business back to its cap. Logging must never
 * undo the action it describes, so a failure here is swallowed: the invoice is
 * already issued whether or not its line made it into the log.
 */
export async function logActivity(actor: ActivityActor, input: ActivityInput): Promise<void> {
  if (!Types.ObjectId.isValid(actor.businessId) || !Types.ObjectId.isValid(actor.userId)) return;

  try {
    const business = new Types.ObjectId(actor.businessId);
    const user = await User.findById(actor.userId).select('name');

    await Activity.create({
      business,
      actorId: new Types.ObjectId(actor.userId),
      actorName: user?.name ?? 'Someone',
      actorRole: actor.role,
      type: input.type,
      summary: input.summary.slice(0, 300),
      ...(input.entityId && Types.ObjectId.isValid(input.entityId)
        ? { entityId: new Types.ObjectId(input.entityId) }
        : {}),
      ...(input.entityLabel ? { entityLabel: input.entityLabel.slice(0, 200) } : {}),
    });

    const total = await Activity.countDocuments({ business });
    if (total > ACTIVITY_LIMIT_PER_BUSINESS) {
      const stale = await Activity.find({ business })
        .sort({ _id: -1 })
        .skip(ACTIVITY_LIMIT_PER_BUSINESS)
        .select('_id');
      if (stale.length > 0) {
        await Activity.deleteMany({ _id: { $in: stale.map((entry) => entry._id) } });
      }
    }
  } catch {
    // The log is a convenience, never a precondition.
  }
}
