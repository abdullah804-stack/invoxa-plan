import { describe, expect, it } from 'vitest';
import {
  documentTitles,
  LABELS,
  LABELS_BY_LANGUAGE,
  label,
  labelsFor,
  resolveLanguage,
} from '../src/labels.js';

describe('invoice labels', () => {
  it('keeps every language on exactly the same keys', () => {
    const english = Object.keys(LABELS).sort();
    for (const language of ['es', 'fr'] as const) {
      expect(Object.keys(LABELS_BY_LANGUAGE[language]).sort()).toEqual(english);
    }
  });

  it('translates document titles and individual labels', () => {
    expect(documentTitles('es')).toEqual({
      invoice: 'Factura',
      estimate: 'Presupuesto',
      credit_note: 'Nota de crédito',
    });
    expect(documentTitles('fr').invoice).toBe('Facture');
    expect(label('billTo', 'fr')).toBe('Facturer à');
    expect(label('total', 'es')).toBe('Total');
  });

  it('resolves regional tags to their base language and falls back to English', () => {
    expect(resolveLanguage('es-MX')).toBe('es');
    expect(resolveLanguage('fr-CA')).toBe('fr');
    expect(resolveLanguage('de')).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
    expect(labelsFor('fr-CA').invoice).toBe('Facture');
  });

  it('never leaves a translated string empty', () => {
    for (const language of ['en', 'es', 'fr'] as const) {
      for (const [key, value] of Object.entries(LABELS_BY_LANGUAGE[language])) {
        expect(value.trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });
});
