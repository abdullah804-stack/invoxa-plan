import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * One running timer per person per business. It lives on the server rather than
 * the phone so a dead battery or a second device cannot lose the start time.
 */
const timerSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    description: { type: String, trim: true },
    startedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

timerSchema.index({ business: 1, user: 1 }, { unique: true });

export type TimerRecord = InferSchemaType<typeof timerSchema>;
export const Timer = model('Timer', timerSchema);
