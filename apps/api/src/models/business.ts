import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * The tenant record. Everything else in the product carries this business ID.
 * Counters are incremented atomically on issue (M3), never by reading first.
 */
const brandSchema = new Schema(
  {
    color: { type: String, default: '#1F5F4A' },
    template: { type: String, enum: ['classic', 'modern', 'minimal'], default: 'classic' },
    fontPair: {
      type: String,
      enum: ['manrope-inter', 'lora-inter', 'space-grotesk-inter'],
      default: 'manrope-inter',
    },
    headerLayout: {
      type: String,
      enum: ['logo-left', 'logo-right', 'centered'],
      default: 'logo-left',
    },
    logoAssetId: { type: Schema.Types.ObjectId, ref: 'BrandAsset' },
    signatureAssetId: { type: Schema.Types.ObjectId, ref: 'BrandAsset' },
  },
  { _id: false },
);

const countersSchema = new Schema(
  {
    invoice: { type: Number, default: 0 },
    estimate: { type: Number, default: 0 },
    credit_note: { type: Number, default: 0 },
  },
  { _id: false },
);

const numberingSchema = new Schema(
  {
    invoice: { type: String, default: 'INV' },
    estimate: { type: String, default: 'EST' },
    credit_note: { type: String, default: 'CN' },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    instructions: { type: String },
    link: { type: String },
  },
  { _id: false },
);

const taxPresetSchema = new Schema(
  {
    name: { type: String, required: true },
    rateBp: { type: Number, required: true },
    checkedOn: { type: String },
    note: { type: String },
  },
  { _id: true },
);

const lateFeeSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    value: { type: Number, default: 0 },
    graceDays: { type: Number, default: 0 },
  },
  { _id: false },
);

const remindersSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    hour: { type: Number, default: 9 },
    daysBefore: { type: Number, default: 2 },
  },
  { _id: false },
);

const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    contactName: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    taxId: { type: String },
    website: { type: String },
    brand: { type: brandSchema, default: () => ({}) },
    pageSize: { type: String, enum: ['A4', 'LETTER'], default: 'A4' },
    language: { type: String, default: 'en' },
    payment: { type: paymentSchema, default: () => ({}) },
    numbering: { type: numberingSchema, default: () => ({}) },
    counters: { type: countersSchema, default: () => ({}) },
    defaultCurrency: { type: String, default: 'USD' },
    taxRateBp: { type: Number, default: 0 },
    taxMode: { type: String, enum: ['added', 'included'], default: 'added' },
    dueDays: { type: Number, default: 14 },
    taxPresets: { type: [taxPresetSchema], default: [] },
    timeRounding: { type: String, enum: ['none', '5', '15'], default: 'none' },
    lateFee: { type: lateFeeSchema, default: () => ({}) },
    reminders: { type: remindersSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type BusinessRecord = InferSchemaType<typeof businessSchema>;
export const Business = model('Business', businessSchema);
