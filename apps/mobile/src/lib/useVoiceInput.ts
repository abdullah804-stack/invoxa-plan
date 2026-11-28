import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { loadSpeechModule } from './speech';
import type { SpeechErrorEvent, SpeechModule, SpeechResultEvent } from './speech';

/**
 * Voice input (plan week 8).
 *
 * Speech is recognised on the device and turned into ordinary editable text: it
 * is never submitted for the user. The mic is hidden where recognition cannot
 * run — Expo Go has no speech native module — and a denial of the microphone
 * permission shows a message instead of silently doing nothing.
 *
 * The package is imported lazily by `loadSpeechModule`, never at module load:
 * a static import throws in Expo Go before the screen can render. The typed
 * "Describe it" flow therefore works everywhere; only the mic depends on it.
 *
 * `expo-speech-recognition` ships a web implementation too, so the same hook
 * works in the browser and in an Android or iOS development build.
 */

/**
 * Whether the recogniser can exist in this build.
 *
 * Expo Go cannot contain a third-party native module, and the package throws
 * while it is being imported when the module is missing, so it must not be
 * imported to find out. Asking native for the module by name is safe: it
 * answers null instead of throwing. The web build always uses the package,
 * because there it ships a browser implementation and needs no native module.
 */
function speechModuleBuiltIn(): boolean {
  if (Platform.OS === 'web') return true;

  try {
    return requireOptionalNativeModule('ExpoSpeechRecognition') !== null;
  } catch {
    return false;
  }
}

export interface VoiceInput {
  available: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useVoiceInput(onText: (text: string) => void, language?: string): VoiceInput {
  const [speech, setSpeech] = useState<SpeechModule | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  const canProbe = useMemo(speechModuleBuiltIn, []);

  useEffect(() => {
    if (!canProbe) return;
    let active = true;
    void loadSpeechModule().then((module) => {
      if (active) setSpeech(module);
    });
    return () => {
      active = false;
    };
  }, [canProbe]);

  useEffect(() => {
    if (!speech) return;

    const onResult = (event: SpeechResultEvent) => {
      const text = event.results?.[0]?.transcript?.trim();
      // Only a finished phrase becomes text, so the prompt is never duplicated
      // by the interim guesses a recogniser sends while the user talks.
      if (text && event.isFinal) handler.current(text);
    };
    const onEnd = () => setListening(false);
    const onError = (event: SpeechErrorEvent) => {
      setListening(false);
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission is needed to speak a draft.'
          : 'Voice input stopped. You can type instead.',
      );
    };

    const subscriptions = [
      speech.addListener('result', onResult),
      speech.addListener('end', onEnd),
      speech.addListener('error', onError),
    ];

    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [speech]);

  const start = useCallback(async () => {
    setError(null);
    if (!speech) return;

    try {
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is needed to speak a draft.');
        return;
      }
      speech.start({
        lang: language && language.includes('-') ? language : `${language ?? 'en'}-US`,
        interimResults: true,
        continuous: false,
      });
      setListening(true);
    } catch {
      setError('Voice input is not available on this device.');
    }
  }, [language, speech]);

  const stop = useCallback(() => {
    if (speech) {
      try {
        speech.stop();
      } catch {
        // Stopping an already stopped recogniser is harmless.
      }
    }
    setListening(false);
  }, [speech]);

  return {
    available: speech !== null,
    listening,
    error,
    start: () => void start(),
    stop,
  };
}
