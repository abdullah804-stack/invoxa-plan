import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Logo picking. The image is resized on the phone and compressed until it fits
 * the server's 300 KB logo limit, so the free database stores one small copy.
 */

export const LOGO_MAX_BYTES = 300 * 1024;

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg'];

export class LogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoError';
  }
}

function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

export async function pickLogoDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new LogoError('Allow photo access to choose a logo from your library.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime && !ALLOWED.includes(mime)) {
    throw new LogoError('Choose a PNG or JPEG image.');
  }

  let width = 600;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = await ImageManipulator.manipulate(asset.uri).resize({ width }).renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.72,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (!saved.base64) {
      throw new LogoError('That image could not be read. Try another file.');
    }
    if (base64Bytes(saved.base64) <= LOGO_MAX_BYTES) {
      return `data:image/jpeg;base64,${saved.base64}`;
    }
    width = Math.max(240, Math.round(width * 0.7));
  }

  throw new LogoError('That logo is still too large. Try a simpler image.');
}
