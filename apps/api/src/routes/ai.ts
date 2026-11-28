import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import {
  aiDraftRequestSchema,
  aiRefineRequestSchema,
  aiTranscribeRequestSchema,
  receiptScanRequestSchema,
} from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { AppError, errors } from '../errors.js';
import { AiUsage } from '../models/aiUsage.js';
import { Business } from '../models/business.js';
import {
  requestAiDraft,
  requestAiRefine,
  requestReceiptScan,
  requestTranscription,
  type AiProvider,
} from '../services/ai.js';
import { requestToday } from '../services/documents.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface AiRouteOptions {
  config: ApiConfig;
}

/**
 * One shared daily cap for everything the assistant does, so drafting and
 * receipt scanning cannot double the free tier. A failed call is refunded.
 */
async function takeAiUse(
  request: FastifyRequest,
  config: ApiConfig,
  businessId: string,
  userId: string,
): Promise<{ used: number; refund: () => Promise<void> }> {
  const filter = {
    business: new Types.ObjectId(businessId),
    user: new Types.ObjectId(userId),
    day: requestToday(request),
  };
  const usage = await AiUsage.findOneAndUpdate(
    filter,
    { $inc: { count: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const used = usage?.count ?? 1;

  if (used > config.aiDailyLimit) {
    // Do not leave the counter above the cap.
    await AiUsage.updateOne(filter, { $inc: { count: -1 } });
    throw new AppError(
      'AI_QUOTA',
      `You have used all ${config.aiDailyLimit} AI requests for today. Try again tomorrow.`,
    );
  }

  return {
    used,
    refund: async () => {
      await AiUsage.updateOne(filter, { $inc: { count: -1 } });
    },
  };
}

interface TextAssistant {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/**
 * The provider that writes text. DeepSeek is text only, so receipts and voice
 * always go to Gemini even when AI_PROVIDER is deepseek.
 */
function textAssistant(config: ApiConfig): TextAssistant | null {
  if (config.aiProvider === 'deepseek') {
    return config.deepseekApiKey
      ? { provider: 'deepseek', apiKey: config.deepseekApiKey, model: config.deepseekModel }
      : null;
  }
  return config.geminiApiKey
    ? { provider: 'gemini', apiKey: config.geminiApiKey, model: config.geminiModel }
    : null;
}

/**
 * AI drafting returns a suggestion; the app creates an ordinary draft from it.
 * The route never writes a document, never assigns a number and never sends
 * anything. Its own caps sit below Google's free tier: 5 requests a minute and
 * AI_DAILY_LIMIT a day per user.
 */
export const aiRoutes: FastifyPluginAsync<AiRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.post(
    '/ai/draft',
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'ai:use');

      const input = parseOrThrow(aiDraftRequestSchema, request.body ?? {});

      const assistant = textAssistant(config);
      if (!assistant) {
        throw new AppError('AI_FAILED', 'AI drafting is not set up on this server yet.');
      }

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const { used, refund } = await takeAiUse(request, config, context.businessId, context.userId);

      let draft;
      try {
        draft = await requestAiDraft({
          provider: assistant.provider,
          apiKey: assistant.apiKey,
          model: assistant.model,
          prompt: input.prompt,
          currency: business.defaultCurrency ?? 'USD',
          docType: input.docType,
          language: business.language ?? 'en',
          taxMode: business.taxMode ?? 'added',
        });
      } catch (error) {
        // A failed call did not use the assistant, so it must not cost a draft.
        await refund();
        throw error;
      }

      return { draft, remaining: Math.max(0, config.aiDailyLimit - used) };
    },
  );

  /** A receipt photo in, confirmed-able expense fields out. The photo is dropped. */
  app.post(
    '/ai/scan-receipt',
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'ai:use');

      const input = parseOrThrow(receiptScanRequestSchema, request.body ?? {});

      // DeepSeek cannot read a photo, so this one always needs Gemini.
      if (!config.geminiApiKey) {
        throw new AppError(
          'AI_FAILED',
          'Receipt scanning needs a Gemini key on this server. Add GEMINI_API_KEY to turn it on.',
        );
      }

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const { used, refund } = await takeAiUse(request, config, context.businessId, context.userId);

      let receipt;
      try {
        receipt = await requestReceiptScan({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          image: input.image,
          currency: business.defaultCurrency ?? 'USD',
          language: business.language ?? 'en',
        });
      } catch (error) {
        await refund();
        throw error;
      }

      return { receipt, remaining: Math.max(0, config.aiDailyLimit - used) };
    },
  );

  /**
   * Voice input on phones without on-device recognition (Expo Go): a short clip
   * in, one editable sentence out. The clip is dropped when the request ends.
   */
  app.post(
    '/ai/transcribe',
    {
      preHandler: authenticateRequest,
      // A compressed recording is a few hundred KB; base64 adds a third.
      bodyLimit: 3 * 1024 * 1024,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'ai:use');

      const input = parseOrThrow(aiTranscribeRequestSchema, request.body ?? {});

      // Transcription is audio, so it always goes to Gemini.
      if (!config.geminiApiKey) {
        throw new AppError(
          'AI_FAILED',
          'Voice input needs a Gemini key on this server. Add GEMINI_API_KEY to turn it on.',
        );
      }

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const { used, refund } = await takeAiUse(request, config, context.businessId, context.userId);

      let result;
      try {
        result = await requestTranscription({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          audio: input.audio,
          ...(input.language ? { language: input.language } : {}),
        });
      } catch (error) {
        await refund();
        throw error;
      }

      return { text: result.text, remaining: Math.max(0, config.aiDailyLimit - used) };
    },
  );

  /**
   * Refine one piece of text the user wrote. It returns text only and never
   * writes a document: prices, quantities, dates and totals never leave the app
   * as prompt text, so the assistant cannot change them.
   */
  app.post(
    '/ai/refine',
    {
      preHandler: authenticateRequest,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const context = await resolveTenant(request);
      requireAction(context, 'ai:use');

      const input = parseOrThrow(aiRefineRequestSchema, request.body ?? {});

      const assistant = textAssistant(config);
      if (!assistant) {
        throw new AppError('AI_FAILED', 'AI editing is not set up on this server yet.');
      }

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const { used, refund } = await takeAiUse(request, config, context.businessId, context.userId);

      let refined;
      try {
        refined = await requestAiRefine({
          provider: assistant.provider,
          apiKey: assistant.apiKey,
          model: assistant.model,
          text: input.text,
          tone: input.tone,
          language: input.language ?? business.language ?? 'en',
        });
      } catch (error) {
        await refund();
        throw error;
      }

      return { text: refined.text, remaining: Math.max(0, config.aiDailyLimit - used) };
    },
  );
};
