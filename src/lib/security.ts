/**
 * Lock primitives for DuoNotes: a device-wide PIN and biometric unlock.
 *
 *  - PIN: stored as { salt, hash } in SecureStore. The raw PIN never touches
 *    disk. One PIN protects every PIN-locked note (like the iOS Notes model).
 *  - Biometric: delegated to the OS via expo-local-authentication (Face ID /
 *    Touch ID / fingerprint). We never see the biometric itself.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { generateSalt, hashSecret, secretsMatch } from '@/lib/crypto';
import { deleteSecret, loadJSON, loadSecret, saveJSON, saveSecret, StorageKeys } from '@/lib/storage';

interface StoredPin {
  salt: string;
  hash: string;
}

export async function isPinSet(): Promise<boolean> {
  return (await loadSecret(StorageKeys.pin)) !== null;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4–8 digits.');
  }
  const salt = await generateSalt();
  const record: StoredPin = { salt, hash: await hashSecret(pin, salt) };
  await saveSecret(StorageKeys.pin, JSON.stringify(record));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = await loadSecret(StorageKeys.pin);
  if (!raw) return false;
  const { salt, hash } = JSON.parse(raw) as StoredPin;
  const attempt = await hashSecret(pin, salt);
  return secretsMatch(attempt, hash);
}

export async function clearPin(): Promise<void> {
  await deleteSecret(StorageKeys.pin);
}

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  /** Human label for the primary sensor, e.g. "Face ID". */
  label: string;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (Platform.OS === 'web') {
    return { available: false, enrolled: false, label: 'Biometrics' };
  }
  const [hasHardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  let label = 'Biometrics';
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    label = Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
  } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    label = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  }
  return { available: hasHardware, enrolled, label };
}

/* --------------------------- App-level lock flag --------------------------- */

/** Whether the whole app is gated behind the PIN/biometric on launch and
 *  when returning from the background. Just a preference — the actual secret
 *  is the shared PIN (or the OS biometric). */
export async function isAppLockEnabled(): Promise<boolean> {
  return loadJSON<boolean>(StorageKeys.appLock, false);
}

export async function setAppLockEnabled(on: boolean): Promise<void> {
  await saveJSON(StorageKeys.appLock, on);
}

/**
 * Serialises biometric prompts across the whole app.
 *
 * Two independent gates can want the sensor at once — the per-note lock in
 * `note/[id]` and the whole-app `AppLockGate` — and each call constructs its
 * own `LAContext` with no in-flight check of its own. Overlapping prompts let
 * iOS cancel one of them, which surfaces to us as an ordinary `success: false`
 * and is indistinguishable from the user failing to authenticate; that is one
 * half of how the app could end up impossible to unlock.
 *
 * Whoever asks first owns the sheet; a second caller arriving while it is up
 * awaits the SAME result rather than racing a second sheet.
 *
 * Note this guards only *prompting*. It deliberately does not gate any
 * re-locking decision — suppressing a lock while auth happens to be in flight
 * would let a real backgrounding slip through unlocked.
 */
let inFlightAuth: Promise<boolean> | null = null;

export function isAuthPromptInFlight(): boolean {
  return inFlightAuth !== null;
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  if (inFlightAuth) return inFlightAuth;

  inFlightAuth = LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    // Let the user fall back to their device passcode if biometrics fail.
    disableDeviceFallback: false,
  })
    .then((result) => result.success)
    .finally(() => {
      inFlightAuth = null;
    });

  return inFlightAuth;
}
