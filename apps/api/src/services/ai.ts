import {
  aiDraftSuggestionSchema,
  majorToMinor,
  percentToBasisPoints,
  redactPersonalData,
  type AiDraftSuggestion,
  type DocumentType,
  type TaxMode,
} from '@invoxa/shared';
import { AppError } from '../errors.js';

/**
 * Gemini drafting. The model is asked for a small JSON shape and every reply is
 * re-validated, clamped and converted to integer minor units here, so a model
 * can never choose a total, a tax mode or a price in cents by accident.
 *
 * Nothing from the database is attached to a prompt: no client records, no
 * business details, no invoices. Emails and links typed by the user are
 * removed first.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 20_000;
const MAX_ITEMS = 20;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
          unit: { type: 'STRING' },
        },
        required: ['description', 'quantity', 'unitPrice'],
      },
    },
    discountPercent: { type: 'NUMBER' },
    taxPercent: { type: 'NUMBER' },
    notes: { type: 'STRING' },
  },
  required: ['items'],
} as const;

interface DraftRequest {
  apiKey: string;
  model: string;
  prompt: string;
  currency: string;
  docType: DocumentType;
  language: string;
  taxMode: TaxMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function percentOrNull(value: unknown): number | null {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return null;
  return percentToBasisPoints(Math.min(100, Math.max(0, percent)));
}

function systemInstruction(input: DraftRequest): string {
  return [
    'You turn a short description of work into a draft invoice for a small business.',
    'Reply with JSON only, matching the response schema. Never write prose.',
    `Currency: ${input.currency}. Amounts are decimal amounts in that currency, not cents.`,
    `Document type: ${input.docType}. Language for descriptions: ${input.language}.`,
    'Rules:',
    `- At most ${MAX_ITEMS} lines. Split clearly separate work into separate lines.`,
    '- Each line needs a specific description. Quantity defaults to 1. Unit price defaults to 0.',
    '- Never invent an email address, address, phone number or tax ID. A client name is allowed only if the user named one.',
    '- Add taxPercent only when the user states a tax rate. Add discountPercent only when the user states a discount.',
    '- Do not write totals, numbers or dates. The app calculates totals and assigns numbers.',
  ].join('\n');
}

/** Old or fenced replies still parse: only the outer JSON object is read. */
export function parseAiDraft(
  reply: string,
  currency: string,
  fallbackTaxMode: TaxMode,
): AiDraftSuggestion | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(raw) || !Array.isArray(raw['items'])) return null;

  const items = raw['items'].slice(0, MAX_ITEMS).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const description =
      typeof entry['description'] === 'string' ? entry['description'].trim().slice(0, 500) : '';
    if (!description) return [];

    const quantityRaw = Number(entry['quantity']);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0
        ? Math.min(100000, Math.round(quantityRaw * 1000) / 1000)
        : 1;

    const priceRaw = Number(entry['unitPrice']);
    let unitPrice = 0;
    if (Number.isFinite(priceRaw) && priceRaw > 0) {
      try {
        unitPrice = majorToMinor(Math.min(priceRaw, 1_000_000_000), currency);
      } catch {
        unitPrice = 0;
      }
    }

    const unit =
      typeof entry['unit'] === 'string' && entry['unit'].trim()
        ? entry['unit'].trim().slice(0, 20)
        : undefined;

    return [{ description, quantity, unitPrice, ...(unit ? { unit } : {}) }];
  });

  if (items.length === 0) return null;

  const discountBp = percentOrNull(raw['discountPercent']);
  const taxBp = percentOrNull(raw['taxPercent']);
  const clientName =
    typeof raw['clientName'] === 'string' && raw['clientName'].trim()
      ? raw['clientName'].trim().slice(0, 200)
      : undefined;
  const notes =
    typeof raw['notes'] === 'string' && raw['notes'].trim()
      ? raw['notes'].trim().slice(0, 2000)
      : undefined;

  const candidate = {
    currency,
    items,
    ...(clientName ? { clientName } : {}),
    ...(discountBp !== null ? { discount: { type: 'percent' as const, valueBp: discountBp } } : {}),
    ...(taxBp !== null ? { taxRateBp: taxBp, taxMode: fallbackTaxMode } : {}),
    ...(notes ? { notes } : {}),
  };

  const parsed = aiDraftSuggestionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function extractText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const candidates = payload['candidates'];
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = isRecord(candidates[0]) ? candidates[0]['content'] : null;
  const parts = isRecord(content) ? content['parts'] : null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const first = parts[0];
  return isRecord(first) && typeof first['text'] === 'string' ? first['text'] : null;
}

export async function requestAiDraft(input: DraftRequest): Promise<AiDraftSuggestion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(input.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header rather than a query string: keys never land in URL logs.
        'x-goog-api-key': input.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction(input) }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `Description: ${redactPersonalData(input.prompt)}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new AppError(
      'AI_FAILED',
      controller.signal.aborted
        ? 'The assistant took too long. Try a shorter description.'
        : 'The assistant could not be reached. Try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new AppError(
      'AI_FAILED',
      response.status === 429
        ? 'The assistant is busy right now. Try again in a minute.'
        : 'The assistant could not draft that. Try again.',
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const text = extractText(payload);
  const draft = text ? parseAiDraft(text, input.currency, input.taxMode) : null;
  if (!draft) {
    throw new AppError(
      'AI_FAILED',
      'The assistant reply could not be read. Try describing it differently.',
    );
  }

  return draft;
}
