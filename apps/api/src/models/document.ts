import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Invoices, estimates and credit notes share one collection and one schema,
 * separated by docType and numbered from separate series. Numbers are assigned
 * only on issue, so drafts carry number: null.
 */

export const lineItemSchema = new Schema(
  {
    id: { type: String, required: true },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    discountBp: { type: Number },
    unit: { type: String, trim: true },
  },
  { _id: false },
);

export const invoiceDiscountSchema = new Schema(
  {
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    valueBp: { type: Number },
    valueMinor: { type: Number },
  },
  { _id: false },
);

export const clientSnapshotSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    taxId: { type: String },
  },
  { _id: false },
);

const snapshotBrandingSchema = new Schema(
  {
    color: { type: String },
    template: { type: String },
    fontPair: { type: String },
    headerLayout: { type: String },
    logoAssetId: { type: Schema.Types.ObjectId, ref: 'BrandAsset' },
    signatureAssetId: { type: Schema.Types.ObjectId, ref: 'BrandAsset' },
  },
  { _id: false },
);

/** Values and asset IDs frozen at issue; the image itself is never copied. */
const brandSnapshotSchema = new Schema(
  {
    businessName: { type: String, required: true },
    contactName: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    taxId: { type: String },
    website: { type: String },
    branding: { type: snapshotBrandingSchema, default: () => ({}) },
    paymentInstructions: { type: String },
    paymentLink: { type: String },
    pageSize: { type: String },
    language: { type: String },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    id: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    paidAt: { type: String, required: true },
    reference: { type: String },
    note: { type: String },
    creditNoteId: { type: Schema.Types.ObjectId, ref: 'Document' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedAt: { type: String },
    /** Set by Mark paid so undo-to-sent can reverse exactly that settlement. */
    settlesBalance: { type: Boolean, default: false },
  },
  { _id: false },
);

const adjustmentSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['late_fee'], required: true },
    amount: { type: Number, required: true },
    basisPoints: { type: Number },
    appliedAt: { type: String, required: true },
    appliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    effectiveDate: { type: String },
  },
  { _id: false },
);

const totalsSchema = new Schema(
  {
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    base: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    /** Device-generated so retries and offline sync never duplicate a draft. */
    clientUuid: { type: String, required: true },
    docType: {
      type: String,
      enum: ['invoice', 'estimate', 'credit_note'],
      required: true,
    },
    number: { type: String, default: null },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'void'],
      default: 'draft',
    },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    clientSnapshot: { type: clientSnapshotSchema },
    items: { type: [lineItemSchema], default: [] },
    currency: { type: String, required: true },
    discount: { type: invoiceDiscountSchema },
    taxRateBp: { type: Number, default: 0 },
    taxMode: { type: String, enum: ['added', 'included'], default: 'added' },
    issueDate: { type: String },
    dueDate: { type: String },
    validUntil: { type: String },
    reference: { type: String },
    notes: { type: String },
    terms: { type: String },
    source: { type: String, default: 'manual' },
    convertedFrom: { type: Schema.Types.ObjectId, ref: 'Document' },
    brandSnapshot: { type: brandSnapshotSchema },
    payments: { type: [paymentSchema], default: [] },
    adjustments: { type: [adjustmentSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

documentSchema.index({ business: 1, clientUuid: 1 }, { unique: true });
/** Numbers are unique per business and series; drafts (null) are excluded. */
documentSchema.index(
  { business: 1, docType: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
documentSchema.index({ business: 1, status: 1, dueDate: 1 });
documentSchema.index({ business: 1, clientId: 1 });
documentSchema.index({ business: 1, createdAt: -1 });

export type DocumentRecord = InferSchemaType<typeof documentSchema>;
export const Document = model('Document', documentSchema);
