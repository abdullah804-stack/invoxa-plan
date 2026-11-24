import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Money going out. Expenses live beside invoices rather than inside them, so a
 * client's invoice total can never be changed by a receipt. Amounts are gross
 * minor units; the optional tax part is kept for reclaiming, not for totals.
 */
const expenseSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    date: { type: String, required: true },
    category: {
      type: String,
      enum: ['software', 'travel', 'meals', 'supplies', 'equipment', 'fees', 'other'],
      required: true,
    },
    description: { type: String, required: true, trim: true },
    vendor: { type: String, trim: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    taxMinor: { type: Number },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

expenseSchema.index({ business: 1, date: -1 });
expenseSchema.index({ business: 1, category: 1, date: -1 });

export type ExpenseRecord = InferSchemaType<typeof expenseSchema>;
export const Expense = model('Expense', expenseSchema);
