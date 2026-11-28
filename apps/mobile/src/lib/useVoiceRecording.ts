import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { deleteAsync, EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input where on-device recognition is unavailable.
 *
 * `expo-speech-recognition` is a third-party native module, so Expo Go cannot
 * run it and the mic would otherwise stay hidden on the phone most people test
 * with. `expo-audio` is part of Expo Go, so this records a short clip instead and
 * hands it to the API, which transcribes it once and drops it. A development
 * build still uses on-device recognition, which sends no audio anywhere.
 */

/** A clip longer than this is cut off: transcription is per sentence, not per call. */
export const MAX_RECORDING_MS = 45_000;

export interface VoiceRecording {
  available: boolean;
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useVoiceRecording(onAudio: (dataUrl: string) => Promise<void>): VoiceRecording {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handler = useRef(onAudio);
  handler.current = onAudio;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (autoStop.current) clearTimeout(autoStop.current);
    };
  }, []);

  const stop = useCallback(async () => {
    if (autoStop.current) {
      clearTimeout(autoStop.current);
      autoStop.current = null;
    }

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setError('That recording was not saved. Try again.');
        return;
      }

      const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      // The clip has been read, so the copy on the phone is deleted right away.
      await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      // The recorder writes AAC in an MP4 container (.m4a).
      if (!mounted.current) return;
      setTranscribing(true);
      await handler.current(`data:audio/mp4;base64,${base64}`);
    } catch (caught) {
      if (mounted.current) {
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : 'That recording could not be turned into text. Try again.',
        );
      }
    } finally {
      if (mounted.current) setTranscribing(false);
    }
  }, [recorder]);

  const start = useCallback(async () => {
    setError(null);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is needed to speak a draft.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      autoStop.current = setTimeout(() => {
        void stop();
      }, MAX_RECORDING_MS);
    } catch {
      setError('Voice input is not available on this device.');
    }
  }, [recorder, stop]);

  return {
    // Recording is part of Expo Go, so it is available wherever the app runs.
    available: true,
    recording: recorderState.isRecording,
    transcribing,
    error,
    start: () => void start(),
    stop: () => void stop(),
  };
}
