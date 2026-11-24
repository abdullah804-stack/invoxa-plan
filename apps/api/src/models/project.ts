import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A project groups one client's work with a budget and an hourly rate. It is
 * referenced by invoices (projectId) and by every tracked time entry.
 */
const projectSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    currency: { type: String, required: true },
    hourlyRateMinor: { type: Number },
    budgetMinor: { type: Number },
    startDate: { type: String },
    dueDate: { type: String },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

projectSchema.index({ business: 1, status: 1, updatedAt: -1 });
projectSchema.index({ business: 1, clientId: 1 });

export type ProjectRecord = InferSchemaType<typeof projectSchema>;
export const Project = model('Project', projectSchema);

/**
 * Tracked time. The rate is snapshotted per entry, so changing the project rate
 * never rewrites what was already worked or billed.
 */
const timeEntrySchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    date: { type: String, required: true },
    minutes: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    hourlyRateMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    billable: { type: Boolean, default: true },
    billedDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

timeEntrySchema.index({ business: 1, projectId: 1, date: -1 });
timeEntrySchema.index({ business: 1, billedDocumentId: 1 });

export type TimeEntryRecord = InferSchemaType<typeof timeEntrySchema>;
export const TimeEntry = model('TimeEntry', timeEntrySchema);
