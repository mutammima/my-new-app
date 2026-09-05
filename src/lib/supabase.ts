import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Substrings that only ever appear in the placeholders shipped in
// `.env.example` — never in a real Supabase project. If any of these survive
// into a build it means the `.env` was never filled in, so we treat the app as
// unconfigured rather than shipping a dead host to the sign-up screen.
const PLACEHOLDER_MARKERS = ['your-project', 'your-anon', 'placeholder', 'example'];

const looksLikePlaceholder = (value: string) =>
  PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker));

/**
 * A real Supabase project URL is an `https://` URL whose host resolves (e.g.
 * `https://abcd1234.supabase.co`). We reject anything that isn't a parseable
 * https URL or that still contains an `.env.example` placeholder, so a bad
 * `.env` shows the "Almost there" setup screen instead of failing with a
 * "can't find host" error on the first network call.
 */
const isValidSupabaseUrl = (value: string | undefined): value is string => {
  if (!value || looksLikePlaceholder(value)) return false;
  try {
    const parsed = new URL(value);
    // Must be https and have a real dotted hostname (not `localhost`, not empty).
    return parsed.protocol === 'https:' && parsed.hostname.includes('.');
  } catch {
    return false;
  }
};

const isValidAnonKey = (value: string | undefined): value is string => {
  if (!value) return false;
  const trimmed = value.trim();
  // Real anon / publishable keys are long opaque tokens; the placeholder is short.
  return trimmed.length >= 20 && !looksLikePlaceholder(trimmed);
};

/**
 * True once you've added a real EXPO_PUBLIC_SUPABASE_URL and
 * EXPO_PUBLIC_SUPABASE_ANON_KEY to your `.env` (see `.env.example`). Placeholder
 * or malformed values count as unconfigured. The app shows a friendly setup
 * screen until this is true instead of crashing.
 */
export const isSupabaseConfigured = isValidSupabaseUrl(url) && isValidAnonKey(anonKey);

// DuoNotes tables live in the `public` schema but are prefixed with `duonotes_`
// so this app can share a Supabase project with other apps without colliding.
export const TABLES = {
  profiles: 'duonotes_profiles',
  notes: 'duonotes_notes',
} as const;

export const RPC = {
  linkPartner: 'duonotes_link_partner',
  deleteAccount: 'duonotes_delete_account',
} as const;

// During web static rendering (`web.output: "static"` in app.json) the app is
// pre-rendered in Node, where there is no `window` and AsyncStorage's
// localStorage backend throws `window is not defined`. There's no user session
// on the server anyway, so fall back to an in-memory store there; the browser
// re-hydrates from real storage on mount.
const memoryStore = new Map<string, string>();
const serverStorage = {
  getItem: (key: string) => Promise.resolve(memoryStore.get(key) ?? null),
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
    return Promise.resolve();
  },
};

const authStorage =
  Platform.OS === 'web' && typeof window === 'undefined' ? serverStorage : AsyncStorage;

// The anon (public) key is safe to ship in a client app — access is governed by
// the Row-Level Security policies in `supabase/schema.sql`, not by hiding it.
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the auth token fresh only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
