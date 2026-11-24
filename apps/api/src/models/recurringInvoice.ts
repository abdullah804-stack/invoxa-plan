import { Schema, model, type InferSchemaType } from 'mongoose';
import { clientSnapshotSchema, invoiceDiscountSchema, lineItemSchema } from './document.js';

/**
 * A recurring invoice repeats one existing invoice: its lines, client, currency,
 * discount, tax and notes are copied here once. Each occurrence becomes a normal
 * draft, so nothing is ever issued or numbered by the schedule itself.
 */
const recurringInvoiceSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    sourceDocumentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    clientSnapshot: { type: clientSnapshotSchema },
    items: { type: [lineItemSchema], default: [] },
    currency: { type: String, required: true },
    discount: { type: invoiceDiscountSchema },
    taxRateBp: { type: Number, default: 0 },
    taxMode: { type: String, enum: ['added', 'included'], default: 'added' },
    notes: { type: String },
    terms: { type: String },
    interval: { type: String, enum: ['weekly', 'monthly', 'yearly'], required: true },
    intervalCount: { type: Number, default: 1 },
    startDate: { type: String, required: true },
    endDate: { type: String },
    nextRunAt: { type: String, required: true },
    dueDays: { type: Number, default: 14 },
    active: { type: Boolean, default: true },
    lastRunAt: { type: String },
    lastDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    lastError: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

recurringInvoiceSchema.index({ business: 1, active: 1, nextRunAt: 1 });
recurringInvoiceSchema.index({ business: 1, sourceDocumentId: 1 });

export type RecurringInvoiceRecord = InferSchemaType<typeof recurringInvoiceSchema>;
export const RecurringInvoice = model('RecurringInvoice', recurringInvoiceSchema);

/**
 * One row per schedule per occurrence. The unique index is what makes a cron run
 * that fires twice, or two servers running at once, create one draft only.
 */
const recurringRunSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    schedule: { type: Schema.Types.ObjectId, ref: 'RecurringInvoice', required: true },
    scheduledFor: { type: String, required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

recurringRunSchema.index({ schedule: 1, scheduledFor: 1 }, { unique: true });

export type RecurringRunRecord = InferSchemaType<typeof recurringRunSchema>;
export const RecurringRun = model('RecurringRun', recurringRunSchema);
