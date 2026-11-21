import { Schema, model, type InferSchemaType } from 'mongoose';

/** Saved line items so repeat work is two taps, not retyping. */
const savedItemSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    unitPrice: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

savedItemSchema.index({ business: 1, createdAt: -1 });

export type SavedItemRecord = InferSchemaType<typeof savedItemSchema>;
export const SavedItem = model('SavedItem', savedItemSchema);
