import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A membership is the only thing that grants access to a business. Every
 * business-scoped request resolves one before touching a document.
 */
const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    role: { type: String, enum: ['owner', 'staff', 'viewer'], required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

membershipSchema.index({ userId: 1, business: 1 }, { unique: true });
membershipSchema.index({ business: 1, role: 1 });

export type MembershipRecord = InferSchemaType<typeof membershipSchema>;
export const Membership = model('Membership', membershipSchema);
