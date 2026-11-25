import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { businessInputSchema, imageUploadSchema } from '@invoxa/shared';
import type { ApiConfig } from '../config.js';
import { authenticate } from '../auth/authenticate.js';
import { errors } from '../errors.js';
import {
  LOGO_MAX_BYTES,
  SIGNATURE_MAX_BYTES,
  parseImageDataUrl,
  type ParsedImage,
} from '../brandAssets.js';
import { BrandAsset } from '../models/brandAsset.js';
import { Business } from '../models/business.js';
import { scoped } from '../scoped.js';
import { applyBusinessUpdate, serializeBusiness } from '../services/business.js';
import { logActivity } from '../services/activity.js';
import { requireAction, resolveTenant } from '../tenant.js';
import { parseOrThrow } from '../validation.js';

interface ProfileRouteOptions {
  config: ApiConfig;
}

type AssetKind = 'logo' | 'signature';

const ASSET_LIMITS: Record<AssetKind, number> = {
  logo: LOGO_MAX_BYTES,
  signature: SIGNATURE_MAX_BYTES,
};

/** Route body limits leave room for base64 expansion above the image limit. */
const ASSET_BODY_LIMITS: Record<AssetKind, number> = {
  logo: 600 * 1024,
  signature: 300 * 1024,
};

const ASSET_FIELD: Record<AssetKind, 'logoAssetId' | 'signatureAssetId'> = {
  logo: 'logoAssetId',
  signature: 'signatureAssetId',
};

async function activeBusiness(request: FastifyRequest) {
  const context = await resolveTenant(request);
  const business = await Business.findById(context.businessId);
  if (!business) {
    throw errors.notFound();
  }
  return { context, business };
}

async function assetFor(
  business: { brand?: { logoAssetId?: unknown; signatureAssetId?: unknown } },
  kind: AssetKind,
) {
  const id = business.brand?.[ASSET_FIELD[kind]];
  if (!id) return null;

  const asset = await BrandAsset.findOne({ _id: id });
  if (!asset) return null;

  return {
    id: String(asset._id),
    mime: asset.mime,
    size: asset.size,
    dataUrl: asset.dataUrl,
  };
}

/** Stores an image once per business; the same bytes reuse the same asset. */
async function storeAsset(businessId: string, image: ParsedImage) {
  const existing = await BrandAsset.findOne({ business: businessId, sha256: image.sha256 });
  if (existing) return existing;

  return BrandAsset.create({
    business: new Types.ObjectId(businessId),
    sha256: image.sha256,
    mime: image.mime,
    dataUrl: image.dataUrl,
    size: image.size,
  });
}

export const profileRoutes: FastifyPluginAsync<ProfileRouteOptions> = async (app, { config }) => {
  const authenticateRequest = authenticate(config);

  app.get('/profile', { preHandler: authenticateRequest }, async (request) => {
    const { business } = await activeBusiness(request);

    return {
      business: serializeBusiness(business),
      logo: await assetFor(business, 'logo'),
      signature: await assetFor(business, 'signature'),
    };
  });

  /**
   * One stored brand asset by ID, so an issued document can render the logo it
   * was issued with even after the business has changed it.
   */
  app.get('/brand-assets/:id', { preHandler: authenticateRequest }, async (request) => {
    const context = await resolveTenant(request);
    requireAction(context, 'documents:read');

    const id = (request.params as { id?: string }).id ?? '';
    if (!Types.ObjectId.isValid(id)) {
      throw errors.notFound();
    }

    const asset = await scoped(BrandAsset, context).findById(id);
    if (!asset) {
      throw errors.notFound();
    }

    return {
      asset: {
        id: String(asset._id),
        mime: asset.mime,
        size: asset.size,
        dataUrl: asset.dataUrl,
      },
    };
  });

  app.put('/profile', { preHandler: authenticateRequest }, async (request) => {
    const { context, business } = await activeBusiness(request);
    requireAction(context, 'business:update');

    const updateSchema = businessInputSchema.partial();
    const input = parseOrThrow(updateSchema, request.body);
    applyBusinessUpdate(business, input);
    await business.save();

    await logActivity(context, {
      type: input.branding !== undefined ? 'brand.updated' : 'business.updated',
      summary:
        input.branding !== undefined
          ? 'Updated the brand and invoice look'
          : 'Updated business settings',
      entityId: context.businessId,
    });

    return {
      business: serializeBusiness(business),
      logo: await assetFor(business, 'logo'),
      signature: await assetFor(business, 'signature'),
    };
  });

  for (const kind of ['logo', 'signature'] as const) {
    app.put(
      `/profile/${kind}`,
      {
        preHandler: authenticateRequest,
        bodyLimit: ASSET_BODY_LIMITS[kind],
      },
      async (request, reply) => {
        const { context, business } = await activeBusiness(request);
        requireAction(context, 'brand:update');

        const input = parseOrThrow(imageUploadSchema, request.body ?? {});
        const image = parseImageDataUrl(input.dataUrl, ASSET_LIMITS[kind]);
        const asset = await storeAsset(context.businessId, image);

        business.brand = {
          ...(business.brand ?? {}),
          [ASSET_FIELD[kind]]: asset._id,
        } as typeof business.brand;
        await business.save();

        return reply.code(200).send({
          [kind]: {
            id: String(asset._id),
            mime: asset.mime,
            size: asset.size,
            dataUrl: asset.dataUrl,
          },
        });
      },
    );

    app.delete(`/profile/${kind}`, { preHandler: authenticateRequest }, async (request, reply) => {
      const { context, business } = await activeBusiness(request);
      requireAction(context, 'brand:update');

      if (business.brand) {
        business.brand[ASSET_FIELD[kind]] = undefined;
        await business.save();
      }

      return reply.code(200).send({ [kind]: null });
    });
  }
};
