import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    /** Never selected by default, so it cannot leak into a response. */
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
