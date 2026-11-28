/**
 * Loads the speech recogniser on demand.
 *
 * `expo-speech-recognition` is a third-party native module, so Expo Go does not
 * contain it and importing the package there throws
 * "Cannot find native module 'ExpoSpeechRecognition'" before any screen can
 * render. Everything that touches the package lives behind `loadSpeechModule`,
 * which turns a missing or broken module into `null`; the voice hook then hides
 * the mic instead of crashing.
 *
 * This file has no runtime imports, so it can be tested without React Native or
 * the native module being present.
 */

/** The part of `expo-speech-recognition` this app uses. */
export interface SpeechModule {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
  addListener(event: 'result', listener: (event: SpeechResultEvent) => void): SpeechSubscription;
  addListener(event: 'end', listener: () => void): SpeechSubscription;
  addListener(event: 'error', listener: (event: SpeechErrorEvent) => void): SpeechSubscription;
}

export interface SpeechSubscription {
  remove(): void;
}

export interface SpeechResultEvent {
  isFinal: boolean;
  results: { transcript: string }[];
}

export interface SpeechErrorEvent {
  error: string;
}

/** Resolves the package namespace. Typed loosely: a broken package must not lie. */
export type SpeechImporter = () => Promise<unknown>;

let cached: SpeechModule | null | undefined;

/**
 * Accepts whatever the package exported and keeps it only if it really is a
 * recogniser. A namespace with no `ExpoSpeechRecognitionModule` (or one missing
 * the methods we call) is treated the same as a missing native module.
 */
export function resolveSpeechModule(loaded: unknown): SpeechModule | null {
  if (!loaded || typeof loaded !== 'object') return null;

  const candidate = (loaded as { ExpoSpeechRecognitionModule?: unknown })
    .ExpoSpeechRecognitionModule;
  if (!candidate || typeof candidate !== 'object') return null;

  const recogniser = candidate as Record<string, unknown>;
  if (
    typeof recogniser['requestPermissionsAsync'] !== 'function' ||
    typeof recogniser['start'] !== 'function' ||
    typeof recogniser['stop'] !== 'function' ||
    typeof recogniser['addListener'] !== 'function'
  ) {
    return null;
  }

  return candidate as SpeechModule;
}

/**
 * Imports the package once, on first use. A rejected import — Expo Go, or any
 * build without the native module — resolves to `null` instead of throwing, and
 * the answer is cached so a known-missing module is not probed again.
 */
export async function loadSpeechModule(
  importer: SpeechImporter = () => import('expo-speech-recognition'),
): Promise<SpeechModule | null> {
  if (cached !== undefined) return cached;

  try {
    cached = resolveSpeechModule(await importer());
  } catch {
    cached = null;
  }

  return cached;
}

/** Test seam: forget the cached probe between cases. */
export function forgetSpeechModule(): void {
  cached = undefined;
}
