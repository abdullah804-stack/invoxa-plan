import { describe, expect, it } from 'vitest';
import { redactPersonalData } from '../src/ai.js';
import { aiDraftRequestSchema, aiDraftSuggestionSchema } from '../src/schemas/ai.js';

describe('AI prompt privacy', () => {
  it('removes email addresses and links but keeps amounts and descriptions', () => {
    const redacted = redactPersonalData(
      'Invoice Acme for 3 days at 450.50 and send it to accounts@acme.test, see https://acme.test/pay',
    );

    expect(redacted).not.toContain('accounts@acme.test');
    expect(redacted).not.toContain('https://acme.test');
    expect(redacted).toContain('[email removed]');
    expect(redacted).toContain('[link removed]');
    expect(redacted).toContain('3 days at 450.50');
  });

  it('collapses whitespace so a pasted paragraph is one prompt', () => {
    expect(redactPersonalData('  Design work\n\n  for Acme  ')).toBe('Design work for Acme');
  });
});

describe('AI schemas', () => {
  it('defaults the request to an invoice', () => {
    const parsed = aiDraftRequestSchema.parse({ prompt: 'Two days of design at 400' });
    expect(parsed.docType).toBe('invoice');
  });

  it('rejects an empty or enormous prompt', () => {
    expect(aiDraftRequestSchema.safeParse({ prompt: ' ' }).success).toBe(false);
    expect(aiDraftRequestSchema.safeParse({ prompt: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('requires at least one line with integer minor-unit prices', () => {
    const base = {
      currency: 'USD',
      items: [{ description: 'Design', quantity: 2, unitPrice: 45000 }],
    };
    expect(aiDraftSuggestionSchema.safeParse(base).success).toBe(true);
    expect(aiDraftSuggestionSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(
      aiDraftSuggestionSchema.safeParse({
        ...base,
        items: [{ description: 'Design', quantity: 2, unitPrice: 450.5 }],
      }).success,
    ).toBe(false);
  });

  it('accepts an optional discount, tax and client name', () => {
    const parsed = aiDraftSuggestionSchema.parse({
      currency: 'EUR',
      clientName: 'Acme',
      items: [{ description: 'Hosting', quantity: 1, unitPrice: 1200 }],
      discount: { type: 'percent', valueBp: 500 },
      taxRateBp: 2000,
      taxMode: 'added',
      notes: 'Draft from a prompt',
    });
    expect(parsed.clientName).toBe('Acme');
    expect(parsed.discount).toEqual({ type: 'percent', valueBp: 500 });
  });
});
