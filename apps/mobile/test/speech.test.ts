import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetSpeechModule, loadSpeechModule, resolveSpeechModule } from '../src/lib/speech';
import type { SpeechModule } from '../src/lib/speech';

function recogniser(): SpeechModule {
  return {
    requestPermissionsAsync: async () => ({ granted: true }),
    start: () => undefined,
    stop: () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };
}

afterEach(() => {
  forgetSpeechModule();
});

describe('speech module loading', () => {
  it('uses the recogniser when the native module is present', async () => {
    const fake = recogniser();
    await expect(
      loadSpeechModule(async () => ({ ExpoSpeechRecognitionModule: fake })),
    ).resolves.toBe(fake);
  });

  it('treats a missing native module as voice not available, not a crash', async () => {
    // This is what Expo Go does: the package's entry point calls
    // requireNativeModule('ExpoSpeechRecognition'), which rejects.
    const importer = vi.fn(async (): Promise<unknown> => {
      throw new Error("Cannot find native module 'ExpoSpeechRecognition'");
    });

    await expect(loadSpeechModule(importer)).resolves.toBeNull();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('remembers a missing module instead of importing it again', async () => {
    const importer = vi.fn(async (): Promise<unknown> => {
      throw new Error('missing');
    });

    await loadSpeechModule(importer);
    await loadSpeechModule(importer);

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('rejects a namespace without a usable recogniser', () => {
    expect(resolveSpeechModule(undefined)).toBeNull();
    expect(resolveSpeechModule({})).toBeNull();
    expect(resolveSpeechModule({ ExpoSpeechRecognitionModule: {} })).toBeNull();
    expect(
      resolveSpeechModule({ ExpoSpeechRecognitionModule: { start: () => undefined } }),
    ).toBeNull();
  });
});
