import {
  aiDraftSuggestionSchema,
  aiRefineResultSchema,
  EXPENSE_CATEGORY_LABELS,
  majorToMinor,
  percentToBasisPoints,
  receiptScanResultSchema,
  redactPersonalData,
  type AiDraftSuggestion,
  type DocumentType,
  type ReceiptScanResult,
  type TaxMode,
} from '@invoxa/shared';
import { AppError } from '../errors.js';

/**
 * Drafting, refining, receipt reading and voice transcription.
 *
 * The model is asked for a small JSON shape and every reply is re-validated,
 * clamped and converted to integer minor units here, so a model can never choose
 * a total, a tax mode or a price in cents by accident.
 *
 * Nothing from the database is attached to a prompt: no client records, no
 * business details, no invoices. Emails and links typed by the user are
 * removed first.
 *
 * Two providers are supported. Gemini handles text, receipt photos and audio;
 * DeepSeek can handle text only (drafting and refining). The model name is
 * configurable because Google retires models: when a configured model is gone
 * (404) the request is retried once with DEFAULT_GEMINI_MODEL, so a stale
 * GEMINI_MODEL cannot take invoicing down.
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 30_000;
/** Audio uploads take longer than a text prompt. */
const AUDIO_TIMEOUT_MS = 90_000;
const MAX_ITEMS = 20;

/** The model used when GEMINI_MODEL is unset, or when the configured one is retired. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

const REFINE_SCHEMA = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
} as const;

export type RefineTone = 'shorter' | 'friendlier' | 'formal' | 'clearer';

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

export type AiProvider = 'gemini' | 'deepseek';

interface ProviderRequest {
  /** Defaults to Gemini so older call sites keep working. */
  provider?: AiProvider;
  apiKey: string;
  model: string;
}

interface DraftRequest extends ProviderRequest {
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

/**
 * What to tell the user when the upstream refuses. The messages stay short and
 * say what can be done; the upstream status is kept in the server log instead.
 */
function upstreamMessage(provider: AiProvider, status: number): string {
  if (status === 401 || status === 403) {
    return provider === 'gemini'
      ? 'The assistant key was rejected by Google. Check GEMINI_API_KEY on the server.'
      : 'The assistant key was rejected by DeepSeek. Check DEEPSEEK_API_KEY on the server.';
  }
  if (status === 402) {
    return 'The assistant account is out of credit. Add credit to the DeepSeek account.';
  }
  if (status === 404) {
    return 'The assistant model is out of date on the server. Set GEMINI_MODEL to a current model.';
  }
  if (status === 429) {
    return 'The assistant is busy right now. Try again in a minute.';
  }
  if (status === 400) {
    return 'The assistant rejected that request. Try describing it differently.';
  }
  return 'The assistant is not available right now. Try again in a minute.';
}

/** Gemini 3 and 2.5 think before answering, which is pointless for a JSON reply. */
function thinkingConfig(model: string): Record<string, unknown> {
  return /^gemini-(3|2\.5)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
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

function extractGeminiText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const candidates = payload['candidates'];
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = isRecord(candidates[0]) ? candidates[0]['content'] : null;
  const parts = isRecord(content) ? content['parts'] : null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const first = parts[0];
  return isRecord(first) && typeof first['text'] === 'string' ? first['text'] : null;
}

const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    vendor: { type: 'STRING' },
    date: { type: 'STRING' },
    description: { type: 'STRING' },
    category: { type: 'STRING' },
    amount: { type: 'NUMBER' },
    tax: { type: 'NUMBER' },
  },
  required: ['description', 'amount'],
} as const;

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS);

interface GeminiJsonRequest {
  apiKey: string;
  model: string;
  system: string;
  parts: unknown[];
  schema: object;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs?: number;
}

interface GeminiAttempt {
  status: number;
  text: string | null;
}

/** One request to one model. Returns the status instead of throwing, so the caller can retry. */
async function callGeminiModel(model: string, input: GeminiJsonRequest): Promise<GeminiAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header rather than a query string: keys never land in URL logs.
          'x-goog-api-key': input.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: input.parts }],
          generationConfig: {
            temperature: input.temperature,
            maxOutputTokens: input.maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: input.schema,
            ...thinkingConfig(model),
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) return { status: response.status, text: null };

    const payload: unknown = await response.json().catch(() => null);
    return { status: 200, text: extractGeminiText(payload) };
  } catch {
    throw new AppError(
      'AI_FAILED',
      controller.signal.aborted
        ? 'The assistant took too long. Try again.'
        : 'The assistant could not be reached. Try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini text out, with one transparent retry on the default model when the
 * configured model has been retired (404). Google retires models regularly, and
 * a stale model name in an environment variable must not stop invoicing.
 */
async function requestGeminiText(input: GeminiJsonRequest): Promise<string> {
  const model = input.model.trim() || DEFAULT_GEMINI_MODEL;
  let attempt = await callGeminiModel(model, input);

  if (attempt.status === 404 && model !== DEFAULT_GEMINI_MODEL) {
    attempt = await callGeminiModel(DEFAULT_GEMINI_MODEL, input);
  }

  if (attempt.status !== 200) {
    throw new AppError('AI_FAILED', upstreamMessage('gemini', attempt.status));
  }
  return attempt.text ?? '';
}

interface DeepseekRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
}

/**
 * DeepSeek is OpenAI-compatible. It is text only: receipts and voice need Gemini.
 * A fenced or plain-text reply still reaches `parseJsonObject`, which reads the
 * outermost JSON object.
 */
async function requestDeepseekText(input: DeepseekRequest): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model.trim() || DEFAULT_DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: `${input.system}\nReply with JSON only.` },
          { role: 'user', content: input.user },
        ],
        response_format: { type: 'json_object' },
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError('AI_FAILED', upstreamMessage('deepseek', response.status));
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || !Array.isArray(payload['choices'])) return '';
    const choice = payload['choices'][0];
    const message = isRecord(choice) ? choice['message'] : null;
    const content = isRecord(message) ? message['content'] : null;
    return typeof content === 'string' ? content : '';
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'AI_FAILED',
      controller.signal.aborted
        ? 'The assistant took too long. Try again.'
        : 'The assistant could not be reached. Try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function isoDateOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? text
    : undefined;
}

function receiptInstruction(input: ReceiptRequest): string {
  return [
    'You read a photo of a purchase receipt for a small business expense.',
    'Reply with JSON only, matching the response schema. Never write prose.',
    `Amounts are decimal amounts in ${input.currency}, not cents.`,
    `Write the description and vendor in ${input.language}.`,
    `- category must be one of: ${CATEGORIES.join(', ')}.`,
    '- amount is the total actually paid, including tax. tax is the tax part when shown.',
    '- date is the calendar date on the receipt as YYYY-MM-DD; omit it when unreadable.',
    '- description is what was bought, short and specific.',
    '- Do not invent a vendor, date, tax amount or total that is not printed.',
  ].join('\n');
}

interface ReceiptRequest {
  apiKey: string;
  model: string;
  /** A PNG or JPEG data URL, resized by the phone. Never stored. */
  image: string;
  currency: string;
  language: string;
}

/**
 * Receipt extraction. The photo is sent once, in one request, and no copy is
 * written to the database, a log or a file: only the fields the user confirms.
 */
export async function requestReceiptScan(input: ReceiptRequest): Promise<ReceiptScanResult> {
  const match = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(input.image);
  const mime = match?.[1] ?? '';
  const data = match?.[2] ?? '';
  if (!mime || !data) {
    throw new AppError('AI_FAILED', 'Send a PNG or JPEG photo of the receipt.');
  }

  const text = await requestGeminiText({
    apiKey: input.apiKey,
    model: input.model,
    system: receiptInstruction(input),
    parts: [{ inline_data: { mime_type: mime, data } }, { text: 'Read this receipt.' }],
    schema: RECEIPT_SCHEMA,
    maxOutputTokens: 512,
    temperature: 0.1,
    timeoutMs: AUDIO_TIMEOUT_MS,
  });

  const raw = text ? parseJsonObject(text) : null;
  if (!raw) {
    throw new AppError('AI_FAILED', 'The receipt reply could not be read. Try a clearer photo.');
  }

  const amountMajor = Number(raw['amount']);
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    throw new AppError('AI_FAILED', 'The total on that receipt could not be read.');
  }

  let amount: number;
  try {
    amount = majorToMinor(Math.min(amountMajor, 1_000_000_000), input.currency);
  } catch {
    throw new AppError('AI_FAILED', 'The total on that receipt could not be read.');
  }

  const taxMajor = Number(raw['tax']);
  let taxMinor = 0;
  if (Number.isFinite(taxMajor) && taxMajor > 0) {
    try {
      taxMinor = Math.min(amount, majorToMinor(Math.min(taxMajor, 1_000_000_000), input.currency));
    } catch {
      taxMinor = 0;
    }
  }

  const categoryRaw =
    typeof raw['category'] === 'string' ? raw['category'].trim().toLowerCase() : '';
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : 'other';
  const vendor =
    typeof raw['vendor'] === 'string' && raw['vendor'].trim()
      ? raw['vendor'].trim().slice(0, 200)
      : undefined;
  const description =
    typeof raw['description'] === 'string' && raw['description'].trim()
      ? raw['description'].trim().slice(0, 500)
      : (vendor ?? 'Receipt');
  const date = isoDateOrUndefined(raw['date']);

  const parsed = receiptScanResultSchema.safeParse({
    description,
    category,
    amount,
    currency: input.currency,
    ...(vendor ? { vendor } : {}),
    ...(date ? { date } : {}),
    ...(taxMinor > 0 ? { taxMinor } : {}),
  });
  if (!parsed.success) {
    throw new AppError('AI_FAILED', 'The receipt could not be read. Try a clearer photo.');
  }

  return parsed.data;
}

function parseJsonObject(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw: unknown = JSON.parse(reply.slice(start, end + 1));
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

interface RefineRequest extends ProviderRequest {
  text: string;
  tone: RefineTone;
  language: string;
}

const TONE_RULES: Record<RefineTone, string> = {
  shorter: 'Make it noticeably shorter while keeping every fact.',
  friendlier: 'Make it warmer and more polite, still professional.',
  formal: 'Make it formal and businesslike.',
  clearer: 'Make it clearer and easier to read, without adding detail.',
};

function refineInstruction(input: RefineRequest): string {
  return [
    'You improve one short piece of text on an invoice written by a small business owner.',
    'Reply with JSON only: {"text": "..."}. Never write prose outside the JSON.',
    `Write in ${input.language}. Keep every fact, name, amount and date exactly as written.`,
    'Do not add new facts, promises, discounts or payment terms.',
    TONE_RULES[input.tone],
    `Text: ${redactPersonalData(input.text)}`,
  ].join('\n');
}

/**
 * Refine rewrites one piece of text the user wrote (line descriptions or notes).
 * It never changes a price, a quantity, a date or a total: those never leave the
 * app as text. Personal data is redacted first, like every other AI call.
 */
export async function requestAiRefine(input: RefineRequest): Promise<{ text: string }> {
  const provider = input.provider ?? 'gemini';
  const instruction = refineInstruction(input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // The plan asks for exactly one retry, so a garbled reply gets one more try.
    const reply =
      provider === 'deepseek'
        ? await requestDeepseekText({
            apiKey: input.apiKey,
            model: input.model,
            system: instruction,
            user: 'Rewrite this text.',
            maxOutputTokens: 800,
            temperature: 0.4,
          })
        : await requestGeminiText({
            apiKey: input.apiKey,
            model: input.model,
            system: instruction,
            parts: [{ text: 'Rewrite this text.' }],
            schema: REFINE_SCHEMA,
            maxOutputTokens: 800,
            temperature: 0.4,
          });

    const raw = reply ? parseJsonObject(reply) : null;
    const parsed = raw ? aiRefineResultSchema.safeParse({ text: raw['text'] }) : null;
    if (parsed?.success) return parsed.data;
  }

  throw new AppError('AI_FAILED', 'The assistant reply could not be read. Try again.');
}

export async function requestAiDraft(input: DraftRequest): Promise<AiDraftSuggestion> {
  const provider = input.provider ?? 'gemini';
  const system = systemInstruction(input);
  const user = `Description: ${redactPersonalData(input.prompt)}`;

  const reply =
    provider === 'deepseek'
      ? await requestDeepseekText({
          apiKey: input.apiKey,
          model: input.model,
          system,
          user,
          maxOutputTokens: 2048,
          temperature: 0.2,
        })
      : await requestGeminiText({
          apiKey: input.apiKey,
          model: input.model,
          system,
          parts: [{ text: user }],
          schema: RESPONSE_SCHEMA,
          maxOutputTokens: 2048,
          temperature: 0.2,
        });

  const draft = reply ? parseAiDraft(reply, input.currency, input.taxMode) : null;
  if (!draft) {
    throw new AppError(
      'AI_FAILED',
      'The assistant reply could not be read. Try describing it differently.',
    );
  }

  return draft;
}

export interface TranscribeRequest {
  /** Always Gemini: it is the only configured provider that accepts audio. */
  apiKey: string;
  model: string;
  /** A short audio data URL recorded on the phone. Never stored. */
  audio: string;
  language?: string;
}

const TRANSCRIBE_SCHEMA = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
} as const;

/**
 * Voice input on phones where on-device recognition is unavailable (Expo Go).
 * The clip is sent once, transcribed, and dropped: nothing is written to disk,
 * the database or a log.
 */
export async function requestTranscription(input: TranscribeRequest): Promise<{ text: string }> {
  const match = /^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i.exec(input.audio);
  const mime = match?.[1] ?? '';
  const data = match?.[2] ?? '';
  if (!mime || !data) {
    throw new AppError('AI_FAILED', 'That recording could not be read. Try again.');
  }

  const language = input.language ? `The speaker is talking in ${input.language}.` : '';
  const text = await requestGeminiText({
    apiKey: input.apiKey,
    model: input.model,
    system: [
      'You transcribe a short spoken invoice description.',
      'Reply with JSON only: {"text": "..."}. Never write prose outside the JSON.',
      'Write exactly what was said, in the same language, as one clean sentence.',
      'Keep amounts, quantities, dates and names as spoken. Do not add or explain anything.',
      language,
    ]
      .filter(Boolean)
      .join('\n'),
    parts: [{ inline_data: { mime_type: mime, data } }, { text: 'Transcribe this recording.' }],
    schema: TRANSCRIBE_SCHEMA,
    maxOutputTokens: 512,
    temperature: 0,
    timeoutMs: AUDIO_TIMEOUT_MS,
  });

  const raw = text ? parseJsonObject(text) : null;
  const spoken = raw && typeof raw['text'] === 'string' ? raw['text'].trim().slice(0, 1000) : '';
  if (!spoken) {
    throw new AppError('AI_FAILED', 'Nothing was heard. Try again, closer to the microphone.');
  }
  return { text: spoken };
}
