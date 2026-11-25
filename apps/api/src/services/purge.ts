import { Types } from 'mongoose';
import { Activity } from '../models/activity.js';
import { AiUsage } from '../models/aiUsage.js';
import { BrandAsset } from '../models/brandAsset.js';
import { Business } from '../models/business.js';
import { Client } from '../models/client.js';
import { Document } from '../models/document.js';
import { Expense } from '../models/expense.js';
import { Invite } from '../models/invite.js';
import { Membership } from '../models/membership.js';
import { Project, TimeEntry } from '../models/project.js';
import { RecurringInvoice, RecurringRun } from '../models/recurringInvoice.js';
import { SavedItem } from '../models/savedItem.js';
import { Timer } from '../models/timer.js';

/**
 * Deletes a business and everything that carries its ID. Delete account uses
 * this for businesses nobody else belongs to, so "delete my account" really
 * removes the clients, invoices, receipts, time, log and invites with it.
 */
export async function purgeBusiness(businessId: string): Promise<void> {
  const business = new Types.ObjectId(businessId);

  await Promise.all([
    Activity.deleteMany({ business }),
    AiUsage.deleteMany({ business }),
    BrandAsset.deleteMany({ business }),
    Client.deleteMany({ business }),
    Document.deleteMany({ business }),
    Expense.deleteMany({ business }),
    Invite.deleteMany({ business }),
    Membership.deleteMany({ business }),
    Project.deleteMany({ business }),
    RecurringInvoice.deleteMany({ business }),
    RecurringRun.deleteMany({ business }),
    SavedItem.deleteMany({ business }),
    TimeEntry.deleteMany({ business }),
    Timer.deleteMany({ business }),
  ]);

  await Business.deleteOne({ _id: business });
}
