import type { DocumentType } from '@invoxa/shared';
import { formatDocumentNumber } from '@invoxa/shared';
import { errors } from '../errors.js';
import { Business } from '../models/business.js';

/**
 * Numbers are assigned only on issue, by one atomic findOneAndUpdate with $inc
 * on the business counter. Reading a counter first and writing it later would
 * hand two parallel issues the same number; this cannot.
 *
 * A failed issue may leave a gap and voided numbers stay used. Numbers are
 * never reused.
 */
export async function assignDocumentNumber(
  businessId: string,
  docType: DocumentType,
): Promise<string> {
  const increment =
    docType === 'invoice'
      ? { 'counters.invoice': 1 }
      : docType === 'estimate'
        ? { 'counters.estimate': 1 }
        : { 'counters.credit_note': 1 };

  const business = await Business.findOneAndUpdate(
    { _id: businessId },
    { $inc: increment },
    { new: true },
  ).exec();

  if (!business) {
    throw errors.notFound();
  }

  const sequence =
    docType === 'invoice'
      ? (business.counters?.invoice ?? 1)
      : docType === 'estimate'
        ? (business.counters?.estimate ?? 1)
        : (business.counters?.credit_note ?? 1);

  const prefix =
    docType === 'invoice'
      ? (business.numbering?.invoice ?? 'INV')
      : docType === 'estimate'
        ? (business.numbering?.estimate ?? 'EST')
        : (business.numbering?.credit_note ?? 'CN');

  return formatDocumentNumber(prefix, sequence);
}
