import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * AI usage per user per calendar day, so the free Gemini tier cannot be drained
 * by one account. The day is the user's own date (X-Timezone), matching the
 * "30 per day per user" cap recorded in docs/limits.md.
 */
const aiUsageSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

aiUsageSchema.index({ business: 1, user: 1, day: 1 }, { unique: true });
/** Retention: usage rows older than 30 days are dropped by MongoDB itself. */
aiUsageSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type AiUsageRecord = InferSchemaType<typeof aiUsageSchema>;
export const AiUsage = model('AiUsage', aiUsageSchema);
