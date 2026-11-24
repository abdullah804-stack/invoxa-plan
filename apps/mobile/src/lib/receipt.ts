import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Receipt photos. The image is shrunk on the phone, sent once to be read, and
 * never kept: the app stores only the fields the user confirms.
 */

export const RECEIPT_MAX_BYTES = 2_500_000;

function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/** Opens the library and returns a small JPEG data URL, or null when cancelled. */
export async function pickReceiptDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow photo access to scan a receipt.');
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

  let width = 1400;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = await ImageManipulator.manipulate(asset.uri).resize({ width }).renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (!saved.base64) {
      throw new Error('That photo could not be read. Try another one.');
    }
    if (base64Bytes(saved.base64) <= RECEIPT_MAX_BYTES) {
      return `data:image/jpeg;base64,${saved.base64}`;
    }
    width = Math.max(700, Math.round(width * 0.7));
  }

  throw new Error('That photo is too large to read. Try again with a closer shot.');
}
