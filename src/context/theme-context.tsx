/**
 * Appearance preferences: light/dark/system scheme + accent hue, persisted
 * on-device. The resolved scheme drives `useTheme()` colors and the navigation
 * theme; the accent hue is merged into `useTheme()` as `accent` / `accentSoft`.
 *
 * Switching between light and dark is CROSS-FADED rather than snapped. The
 * provider animates a 0→1 progress value and `useTheme()` interpolates every
 * colour token against it, so the whole app eases between palettes instead of
 * flipping in one frame. The transition re-renders consumers each frame, which
 * is why it's deliberately short and only runs when the scheme actually
 * changes — never on first mount (there is nothing to animate from).
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_ACCENT_HUE,
  LEGACY_ACCENT_HUES,
  type AccentKey,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

const TRANSITION_MS = 420;

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  /** Accent hue on the colour wheel, 0–360. */
  accentHue: number;
  /**
   * Cross-fade state. `from` is the scheme being left, `progress` runs 0→1.
   * At progress 1 (or when `from === scheme`) the fade is complete.
   */
  from: ColorScheme;
  progress: number;
  setPreference: (preference: ThemePreference) => void;
  setAccentHue: (hue: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  const [accentHue, setHue] = useState<number>(DEFAULT_ACCENT_HUE);

  useEffect(() => {
    loadJSON<ThemePreference>(StorageKeys.themePreference, 'system').then(setPref);
    // Prefer the new hue; fall back to translating a previously-saved preset so
    // an existing install keeps the exact accent it already had.
    loadJSON<number | null>(StorageKeys.accentHue, null).then((saved) => {
      if (typeof saved === 'number') {
        setHue(saved);
        return;
      }
      loadJSON<AccentKey | null>(StorageKeys.accentPreference, null).then((legacy) => {
        if (legacy && legacy in LEGACY_ACCENT_HUES) setHue(LEGACY_ACCENT_HUES[legacy]);
      });
    });
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPref(next);
    void saveJSON(StorageKeys.themePreference, next);
  };
  const setAccentHue = (next: number) => {
    const clamped = ((Math.round(next) % 360) + 360) % 360;
    setHue(clamped);
    void saveJSON(StorageKeys.accentHue, clamped);
  };

  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  // Drive the cross-fade whenever the resolved scheme flips.
  const [fade, setFade] = useState<{ from: ColorScheme; progress: number }>({
    from: scheme,
    progress: 1,
  });
  const prevScheme = useRef(scheme);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevScheme.current === scheme) return;
    const from = prevScheme.current;
    prevScheme.current = scheme;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const start = Date.now();
    setFade({ from, progress: 0 });

    const step = () => {
      const t = Math.min(1, (Date.now() - start) / TRANSITION_MS);
      // Ease-in-out, so the change starts and settles gently rather than
      // running at a constant rate.
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setFade({ from, progress: eased });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [scheme]);

  const value = useMemo(
    () => ({
      preference,
      scheme,
      accentHue,
      from: fade.from,
      progress: fade.progress,
      setPreference,
      setAccentHue,
    }),
    [preference, scheme, accentHue, fade.from, fade.progress],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Full appearance API — for the Settings switchers. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within a <ThemePreferenceProvider>.');
  return ctx;
}

/** The scheme in effect. Falls back to the OS scheme outside the provider. */
export function useThemeScheme(): ColorScheme {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  if (ctx) return ctx.scheme;
  return system === 'dark' ? 'dark' : 'light';
}

/** Cross-fade state for `useTheme()`. Static (no fade) outside the provider. */
export function useSchemeFade(): { from: ColorScheme; to: ColorScheme; progress: number } {
  const ctx = useContext(ThemeContext);
  const scheme = useThemeScheme();
  if (!ctx) return { from: scheme, to: scheme, progress: 1 };
  return { from: ctx.from, to: ctx.scheme, progress: ctx.progress };
}

/** The accent hue in effect. Falls back to the default outside the provider. */
export function useAccentHue(): number {
  return useContext(ThemeContext)?.accentHue ?? DEFAULT_ACCENT_HUE;
}
