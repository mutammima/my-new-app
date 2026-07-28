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
  accentPreference: 'duonotes.accentPreference', // 'rose' | 'coral' | 'lavender' | 'blue'
  session: 'duonotes.session', // SecureStore
  pin: 'duonotes.pin', // SecureStore — JSON { salt, hash }
  appLock: 'duonotes.appLock', // AsyncStorage — boolean, gate the whole app behind PIN/biometric
  seen: 'duonotes.seen', // AsyncStorage prefix — `${seen}.${userId}` -> { [noteId]: updatedAt }
  // Pinned-to-top note ids, per person — a shared note can matter to one
  // partner and not the other, so this is deliberately not synced.
  pinned: 'duonotes.pinned', // AsyncStorage prefix — `${pinned}.${userId}` -> { [noteId]: true }
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
