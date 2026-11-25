import Constants from 'expo-constants';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Voice input (plan week 8).
 *
 * Speech is recognised on the device and turned into ordinary editable text: it
 * is never submitted for the user. The mic is hidden where recognition cannot
 * run (Expo Go has no speech module, so the feature needs a dev build), and a
 * denial of the microphone permission shows a message instead of silently doing
 * nothing.
 *
 * `expo-speech-recognition` ships a web implementation too, so the same hook
 * works in the browser and in an Android or iOS build.
 */

interface SpeechModule {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
}

const Speech = ExpoSpeechRecognitionModule as unknown as SpeechModule;

export interface VoiceInput {
  available: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useVoiceInput(onText: (text: string) => void, language?: string): VoiceInput {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  const available = useMemo(() => Constants.executionEnvironment !== 'storeClient', []);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript?.trim();
    // Only a finished phrase becomes text, so the prompt is never duplicated
    // by the interim guesses a recogniser sends while the user talks.
    if (text && event.isFinal) handler.current(text);
  });

  useSpeechRecognitionEvent('end', () => setListening(false));

  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    const code = typeof event.error === 'string' ? event.error : '';
    setError(
      code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Microphone permission is needed to speak a draft.'
        : 'Voice input stopped. You can type instead.',
    );
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await Speech.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is needed to speak a draft.');
        return;
      }
      Speech.start({
        lang: language && language.includes('-') ? language : `${language ?? 'en'}-US`,
        interimResults: true,
        continuous: false,
      });
      setListening(true);
    } catch {
      setError('Voice input is not available on this device.');
    }
  }, [language]);

  const stop = useCallback(() => {
    try {
      Speech.stop();
    } catch {
      // Stopping an already stopped recogniser is harmless.
    }
    setListening(false);
  }, []);

  return { available, listening, error, start: () => void start(), stop };
}
