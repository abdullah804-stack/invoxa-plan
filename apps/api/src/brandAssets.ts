import { createHash } from 'node:crypto';
import { errors } from './errors.js';

/** Size limits from the plan: logo 300 KB, signature 100 KB. */
export const LOGO_MAX_BYTES = 300 * 1024;
export const SIGNATURE_MAX_BYTES = 100 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedImage {
  mime: 'image/png' | 'image/jpeg';
  dataUrl: string;
  size: number;
  sha256: string;
}

/**
 * Accepts only a PNG or JPEG data URL, verifies the decoded bytes against the
 * declared mime type (a data URL cannot be trusted on its label alone) and
 * enforces the size limit.
 */
export function parseImageDataUrl(input: unknown, maxBytes: number): ParsedImage {
  if (typeof input !== 'string') {
    throw errors.validation([{ path: 'dataUrl', message: 'Provide an image' }]);
  }

  const match = DATA_URL.exec(input.trim());
  const mime = match?.[1] as 'image/png' | 'image/jpeg' | undefined;
  const base64 = match?.[2];
  if (!mime || !base64) {
    throw errors.validation([{ path: 'dataUrl', message: 'Use a PNG or JPEG data URL' }]);
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) {
    throw errors.validation([{ path: 'dataUrl', message: 'The image is empty' }]);
  }

  const isPng = bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png' && !isPng) {
    throw errors.validation([{ path: 'dataUrl', message: 'That is not a PNG image' }]);
  }
  if (mime === 'image/jpeg' && !isJpeg) {
    throw errors.validation([{ path: 'dataUrl', message: 'That is not a JPEG image' }]);
  }
  if (!isPng && !isJpeg) {
    throw errors.validation([{ path: 'dataUrl', message: 'Use a PNG or JPEG image' }]);
  }

  if (bytes.length > maxBytes) {
    throw errors.payloadTooLarge(
      `That image is ${Math.ceil(bytes.length / 1024)} KB. The limit is ${Math.floor(maxBytes / 1024)} KB.`,
    );
  }

  return {
    mime,
    dataUrl: `data:${mime};base64,${base64}`,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
