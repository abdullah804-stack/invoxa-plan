import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { readSecure, StorageKeys, writeSecure } from './storage';

/**
 * The app lock never leaves the phone: the setting, the timeout and the
 * biometric check are local, so the server cannot turn it off or read it.
 */

export interface AppLockSettings {
  enabled: boolean;
  /** Minutes in the background before the app locks itself again. */
  timeoutMinutes: number;
}

export const APP_LOCK_TIMEOUTS: { value: string; label: string; minutes: number }[] = [
  { value: '1', label: '1 min', minutes: 1 },
  { value: '5', label: '5 min', minutes: 5 },
  { value: '15', label: '15 min', minutes: 15 },
];

export const DEFAULT_APP_LOCK: AppLockSettings = { enabled: false, timeoutMinutes: 5 };

export interface BiometricSupport {
  available: boolean;
  enrolled: boolean;
  /** "fingerprint" or "face or fingerprint", for the screen's copy. */
  label: string;
}

export async function loadAppLock(): Promise<AppLockSettings> {
  const raw = await readSecure(StorageKeys.appLock);
  if (!raw) return DEFAULT_APP_LOCK;
  try {
    const parsed = JSON.parse(raw) as Partial<AppLockSettings>;
    const allowed = APP_LOCK_TIMEOUTS.some((option) => option.minutes === parsed.timeoutMinutes);
    return {
      enabled: parsed.enabled === true,
      timeoutMinutes: allowed ? (parsed.timeoutMinutes as number) : DEFAULT_APP_LOCK.timeoutMinutes,
    };
  } catch {
    return DEFAULT_APP_LOCK;
  }
}

export async function saveAppLock(settings: AppLockSettings): Promise<void> {
  await writeSecure(StorageKeys.appLock, JSON.stringify(settings));
}

/** The web build has no OS biometric API, so the lock is simply unavailable. */
export async function checkBiometrics(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') {
    return { available: false, enrolled: false, label: 'fingerprint or face' };
  }

  try {
    const available = await LocalAuthentication.hasHardwareAsync();
    const enrolled = available ? await LocalAuthentication.isEnrolledAsync() : false;
    const types = available ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const label = face && fingerprint ? 'face or fingerprint' : face ? 'face' : 'fingerprint';
    return { available, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: 'fingerprint or face' };
  }
}

/** True only for a successful OS check; a cancel or a lockout is a false. */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Invoxa',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
