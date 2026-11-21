import { describe, expect, it } from 'vitest';
import {
  formatDocumentNumber,
  formatSeriesNumber,
  parseDocumentNumber,
  SERIES_PREFIXES,
} from '../src/index.js';

describe('document numbering', () => {
  it('pads to four digits', () => {
    expect(formatDocumentNumber('INV', 42)).toBe('INV-0042');
    expect(formatDocumentNumber('INV', 1)).toBe('INV-0001');
    expect(formatDocumentNumber('INV', 9999)).toBe('INV-9999');
    expect(formatDocumentNumber('INV', 12345)).toBe('INV-12345');
  });

  it('uses a separate series per document type', () => {
    expect(SERIES_PREFIXES).toEqual({ invoice: 'INV', estimate: 'EST', credit_note: 'CN' });
    expect(formatSeriesNumber('estimate', 7)).toBe('EST-0007');
    expect(formatSeriesNumber('credit_note', 3)).toBe('CN-0003');
  });

  it('rejects invalid prefixes and sequences', () => {
    expect(() => formatDocumentNumber('inv', 1)).toThrow(/uppercase/);
    expect(() => formatDocumentNumber('INV', 0)).toThrow(/positive integer/);
    expect(() => formatDocumentNumber('INV', 1.5)).toThrow(/positive integer/);
  });

  it('parses numbers back to prefix and sequence', () => {
    expect(parseDocumentNumber('INV-0042')).toEqual({ prefix: 'INV', sequence: 42 });
    expect(parseDocumentNumber('CN-10000')).toEqual({ prefix: 'CN', sequence: 10000 });
    expect(parseDocumentNumber('INV42')).toBeNull();
    expect(parseDocumentNumber('INV-42')).toBeNull();
  });

  it('never formats the same number twice for a sequence', () => {
    const numbers = new Set<string>();
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      numbers.add(formatDocumentNumber('INV', sequence));
    }
    expect(numbers.size).toBe(20);
  });
});
