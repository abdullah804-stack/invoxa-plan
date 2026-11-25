import { Schema, model, type InferSchemaType } from 'mongoose';
import { ACTIVITY_TYPES } from '@invoxa/shared';

/**
 * One row per thing that happened in a business: who did it, what it was and
 * which record it touched. Capped per business so the free tier cannot fill.
 */
const activitySchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Copied at write time so a removed member's name still reads. */
    actorName: { type: String, required: true, maxlength: 200 },
    actorRole: { type: String, enum: ['owner', 'staff', 'viewer'], required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    summary: { type: String, required: true, maxlength: 300 },
    entityId: { type: Schema.Types.ObjectId },
    entityLabel: { type: String, maxlength: 200 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// The screen pages newest first, and the cap trims from the same direction.
activitySchema.index({ business: 1, _id: -1 });

export type ActivityRecord = InferSchemaType<typeof activitySchema>;
export const Activity = model('Activity', activitySchema);
