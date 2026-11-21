import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * The client book. nameKey is the normalised name used for matching (AI drafts,
 * duplicate detection), never shown to the user. Deleting a client that an
 * issued document references archives it instead, so history stays readable.
 */
const clientSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    nameKey: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    taxId: { type: String, trim: true },
    notes: { type: String, trim: true },
    archived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

clientSchema.index({ business: 1, nameKey: 1 });
clientSchema.index({ business: 1, archived: 1, name: 1 });

export type ClientRecord = InferSchemaType<typeof clientSchema>;
export const Client = model('Client', clientSchema);
