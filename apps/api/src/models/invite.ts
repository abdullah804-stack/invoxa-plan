import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * An invite code is eight characters, stored only as a SHA-256 hash, usable
 * once and dead after seven days. The plaintext code exists in the response
 * that created it and nowhere else.
 */
const inviteSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    role: { type: String, enum: ['staff', 'viewer'], required: true },
    codeHash: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

inviteSchema.index({ codeHash: 1 }, { unique: true });
inviteSchema.index({ business: 1, createdAt: -1 });
// Expired invites are removed by MongoDB; the route also refuses them by date.
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type InviteRecord = InferSchemaType<typeof inviteSchema>;
export const Invite = model('Invite', inviteSchema);
