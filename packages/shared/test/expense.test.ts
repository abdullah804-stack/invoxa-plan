import { describe, expect, it } from 'vitest';
import { expenseInputSchema, expenseListQuerySchema } from '../src/schemas/expense.js';

const base = {
  date: '2026-11-24',
  category: 'software',
  description: 'Design tool subscription',
  amount: 2400,
  currency: 'USD',
};

describe('expense schema', () => {
  it('accepts a complete expense', () => {
    const parsed = expenseInputSchema.parse({ ...base, vendor: 'Figma', taxMinor: 400 });
    expect(parsed.amount).toBe(2400);
    expect(parsed.category).toBe('software');
  });

  it('rejects zero, negative, fractional or unknown money', () => {
    expect(expenseInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, amount: -100 }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, amount: 12.5 }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, currency: 'XYZ' }).success).toBe(false);
  });

  it('rejects a missing description, unknown category and impossible date', () => {
    expect(expenseInputSchema.safeParse({ ...base, description: ' ' }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, category: 'rent' }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...base, date: '2026-02-30' }).success).toBe(false);
  });

  it('defaults the list limit and caps it', () => {
    expect(expenseListQuerySchema.parse({}).limit).toBe(100);
    expect(expenseListQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(expenseListQuerySchema.parse({ category: 'travel', from: '2026-11-01' })).toMatchObject({
      category: 'travel',
      from: '2026-11-01',
    });
  });
});
