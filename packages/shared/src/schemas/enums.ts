import { z } from 'zod';
import { CURRENCIES } from '../format.js';

export const currencySchema = z.enum(CURRENCIES);

export const taxModeSchema = z.enum(['added', 'included']);

export const documentTypeSchema = z.enum(['invoice', 'estimate', 'credit_note']);

export const storedDocumentStatusSchema = z.enum(['draft', 'sent', 'paid', 'void']);

export const shownStatusSchema = z.enum([
  'draft',
  'sent',
  'partial',
  'overdue',
  'paid',
  'void',
  'expired',
]);

export const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'card',
  'mobile_money',
  'cheque',
  'credit_note',
  'other',
]);

export const documentSourceSchema = z.enum([
  'manual',
  'prompt',
  'voice',
  'recurring',
  'duplicate',
  'estimate',
]);

export const templateSchema = z.enum(['classic', 'modern', 'minimal']);

export const fontPairSchema = z.enum(['manrope-inter', 'lora-inter', 'space-grotesk-inter']);

export const headerLayoutSchema = z.enum(['logo-left', 'logo-right', 'centered']);

export const pageSizeSchema = z.enum(['A4', 'LETTER']);

export const expenseCategorySchema = z.enum([
  'software',
  'travel',
  'meals',
  'supplies',
  'equipment',
  'fees',
  'other',
]);

export const roleSchema = z.enum(['owner', 'staff', 'viewer']);

export const memberRoleSchema = roleSchema;
