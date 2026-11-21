import { describe, expect, it } from 'vitest';
import {
  clientInputSchema,
  currencySchema,
  documentInputSchema,
  formatDate,
  formatMoney,
  httpsUrlSchema,
  lineItemSchema,
  minorToMajorString,
  normalizeNameKey,
  taxPresetSchema,
} from '../src/index.js';

describe('money and currency validation', () => {
  it('accepts only the supported currency list', () => {
    expect(currencySchema.parse('USD')).toBe('USD');
    expect(currencySchema.safeParse('XYZ').success).toBe(false);
    expect(currencySchema.safeParse('usd').success).toBe(false);
  });

  it('rejects float money and quantities over 3 decimals', () => {
    const item = { description: 'Design', quantity: 1, unitPrice: 12000 };
    expect(lineItemSchema.safeParse(item).success).toBe(true);
    expect(lineItemSchema.safeParse({ ...item, unitPrice: 120.5 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...item, quantity: 1.2345 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...item, quantity: 1.234 }).success).toBe(true);
  });

  it('requires a description on every line', () => {
    expect(lineItemSchema.safeParse({ description: '  ', quantity: 1, unitPrice: 1 }).success).toBe(
      false,
    );
  });
});

describe('payment links', () => {
  it('accepts https only', () => {
    expect(httpsUrlSchema.safeParse('https://paypal.me/business').success).toBe(true);
    expect(httpsUrlSchema.safeParse('http://paypal.me/business').success).toBe(false);
    expect(httpsUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpsUrlSchema.safeParse('data:text/html,<script>').success).toBe(false);
  });
});

describe('business and client schemas', () => {
  it('rejects tax rates above 100 percent', () => {
    expect(taxPresetSchema.safeParse({ name: 'VAT 20%', rateBp: 2000 }).success).toBe(true);
    expect(taxPresetSchema.safeParse({ name: 'Broken', rateBp: 10001 }).success).toBe(false);
  });

  it('normalises client name keys for matching', () => {
    expect(normalizeNameKey('  Acmé  Studio, Ltd. ')).toBe('acme studio ltd');
    expect(normalizeNameKey('ACME   Studio Ltd')).toBe(normalizeNameKey('Acme Studio Ltd'));
  });

  it('requires a client name', () => {
    expect(clientInputSchema.safeParse({ name: 'Ayesha Khan' }).success).toBe(true);
    expect(clientInputSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('document input', () => {
  const valid = {
    clientUuid: 'device-1234-5678',
    docType: 'invoice',
    items: [{ description: 'Consulting', quantity: 10, unitPrice: 12000 }],
    currency: 'PKR',
  };

  it('accepts a minimal draft and fills defaults', () => {
    const parsed = documentInputSchema.parse(valid);
    expect(parsed.taxRateBp).toBe(0);
    expect(parsed.taxMode).toBe('added');
    expect(parsed.source).toBe('manual');
  });

  it('rejects an unknown document type and a short clientUuid', () => {
    expect(documentInputSchema.safeParse({ ...valid, docType: 'receipt' }).success).toBe(false);
    expect(documentInputSchema.safeParse({ ...valid, clientUuid: 'abc' }).success).toBe(false);
  });

  it('rejects a malformed due date', () => {
    expect(documentInputSchema.safeParse({ ...valid, dueDate: '2026-02-31' }).success).toBe(false);
    expect(documentInputSchema.safeParse({ ...valid, dueDate: '2026-12-01' }).success).toBe(true);
  });
});

describe('formatting', () => {
  it('converts minor units to a plain decimal string', () => {
    expect(minorToMajorString(132000, 'USD')).toBe('1320.00');
    expect(minorToMajorString(1320, 'JPY')).toBe('1320');
    expect(minorToMajorString(1234, 'KWD')).toBe('1.234');
    expect(minorToMajorString(0, 'USD')).toBe('0.00');
  });

  it('formats money with the document currency', () => {
    expect(formatMoney(132000, 'USD', 'en')).toContain('1,320');
    expect(formatMoney(132000, 'PKR', 'en')).toMatch(/1,320/);
  });

  it('formats calendar dates without a time zone shift', () => {
    expect(formatDate('2026-11-21', 'en')).toMatch(/2026/);
    expect(formatDate('2026-11-21', 'en')).toMatch(/21/);
  });
});
