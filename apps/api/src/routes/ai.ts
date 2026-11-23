import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { aiDraftRequestSchema } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { AppError, errors } from '../errors.js';
import { AiUsage } from '../models/aiUsage.js';
import { Business } from '../models/business.js';
import { requestAiDraft } from '../services/ai.js';
import { requestToday } from '../services/documents.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface AiRouteOptions {
  config: ApiConfig;
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

      if (!config.geminiApiKey) {
        throw new AppError('AI_FAILED', 'AI drafting is not set up on this server yet.');
      }

      const business = await Business.findById(context.businessId);
      if (!business) {
        throw errors.notFound();
      }

      const usageFilter = {
        business: new Types.ObjectId(context.businessId),
        user: new Types.ObjectId(context.userId),
        day: requestToday(request),
      };
      const usage = await AiUsage.findOneAndUpdate(
        usageFilter,
        { $inc: { count: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      const used = usage?.count ?? 1;

      if (used > config.aiDailyLimit) {
        // Do not leave the counter above the cap.
        await AiUsage.updateOne(usageFilter, { $inc: { count: -1 } });
        throw new AppError(
          'AI_QUOTA',
          `You have used all ${config.aiDailyLimit} AI drafts for today. Try again tomorrow.`,
        );
      }

      const refund = async (): Promise<void> => {
        await AiUsage.updateOne(usageFilter, { $inc: { count: -1 } });
      };

      let draft;
      try {
        draft = await requestAiDraft({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
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
};
