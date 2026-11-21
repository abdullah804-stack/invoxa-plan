import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Logos and signatures are stored once per business and referenced by content
 * hash, so 1,000 invoices share one image instead of copying it 1,000 times.
 */
const brandAssetSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    sha256: { type: String, required: true },
    mime: { type: String, enum: ['image/png', 'image/jpeg'], required: true },
    dataUrl: { type: String, required: true },
    size: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

brandAssetSchema.index({ business: 1, sha256: 1 }, { unique: true });

export type BrandAssetRecord = InferSchemaType<typeof brandAssetSchema>;
export const BrandAsset = model('BrandAsset', brandAssetSchema);
