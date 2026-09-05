/**
 * Thin persistence layer.
 *
 *  - Non-secret data (notes, the current user profile) → AsyncStorage.
 *  - Secrets (session token, PIN salt+hash) → SecureStore, which is backed by
 *    the iOS Keychain / Android Keystore.
 *
 * Everything here is keyed by simple string constants so the whole app has a
 * single, easy-to-audit list of what is stored where.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const StorageKeys = {
  notes: 'duonotes.notes', // offline cache prefix — actual key is `${notes}.${userId}`
  pending: 'duonotes.pending', // offline sync queue prefix — `${pending}.${userId}`
  profile: 'duonotes.profile', // cached auth profile prefix — `${profile}.${userId}`
  users: 'duonotes.users',
  themePreference: 'duonotes.themePreference', // 'light' | 'dark' | 'system'
  accentPreference: 'duonotes.accentPreference', // LEGACY 'rose'|'coral'|'lavender'|'blue' — migrated to accentHue
  accentHue: 'duonotes.accentHue', // number 0-360 on the colour wheel
  session: 'duonotes.session', // SecureStore
  pin: 'duonotes.pin', // SecureStore — JSON { salt, hash }
  appLock: 'duonotes.appLock', // AsyncStorage — boolean, gate the whole app behind PIN/biometric
  seen: 'duonotes.seen', // AsyncStorage prefix — `${seen}.${userId}` -> { [noteId]: updatedAt }
  // Pinned-to-top note ids, per person — a shared note can matter to one
  // partner and not the other, so this is deliberately not synced.
  pinned: 'duonotes.pinned', // AsyncStorage prefix — `${pinned}.${userId}` -> { [noteId]: true }
  // Folder grouping, also per person. Lives here rather than in collections.ts
  // so wipeLocalUserData below can clear it without importing that module —
  // collections.ts imports this one, and the cycle would be real.
  collections: 'duonotes.collections', // AsyncStorage prefix — `${collections}.${userId}`
} as const;

/* ------------------------------- AsyncStorage ------------------------------ */

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/* -------------------------------- SecureStore ------------------------------ */

export async function loadSecret(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function saveSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/* ------------------------------ Account wipe ------------------------------ */

export async function removeJSON(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best effort. A key we cannot clear is not worth failing a deletion over,
    // and the server rows are already gone by the time this runs.
  }
}

/**
 * Clears everything this device holds for one account.
 *
 * Called after the account is deleted server-side: at that point anything left
 * here is an orphaned copy of notes the user explicitly asked us to destroy, and
 * it would be handed straight to whoever signs in next on this phone.
 *
 * The PIN and the app-lock flag are device-wide rather than per-user, and are
 * cleared too — leaving a deleted account's PIN behind locks the next person out
 * of an app that has nothing in it.
 */
export async function wipeLocalUserData(userId: string): Promise<void> {
  const perUser = [
    StorageKeys.notes,
    StorageKeys.pending,
    StorageKeys.profile,
    StorageKeys.seen,
    StorageKeys.pinned,
    StorageKeys.collections,
  ].map((prefix) => `${prefix}.${userId}`);

  await Promise.all([...perUser, StorageKeys.appLock].map(removeJSON));
  await deleteSecret(StorageKeys.pin);
}
