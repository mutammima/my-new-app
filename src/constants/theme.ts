/**
 * Color tokens for light and dark mode, plus the selectable accent palettes.
 * Neutrals are gently warmed for a friendlier, less clinical feel.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1618',
    background: '#FFFCFB',
    backgroundElement: '#F6F1EF',
    backgroundSelected: '#ECE4E1',
    textSecondary: '#6B646A',
  },
  dark: {
    text: '#FBF7F6',
    background: '#0E0C0D',
    backgroundElement: '#1E1A1C',
    backgroundSelected: '#2B2528',
    textSecondary: '#B4ABAF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Selectable accent palettes (chosen in Settings → Appearance). */
export const ACCENTS = {
  rose: '#E6488E',
  coral: '#FB7185',
  lavender: '#9B7EDE',
  blue: '#3C87F7',
} as const;

export type AccentKey = keyof typeof ACCENTS;

export const ACCENT_LABELS: Record<AccentKey, string> = {
  rose: 'Rose',
  coral: 'Coral',
  lavender: 'Lavender',
  blue: 'Blue',
};

/** Translucent tint of a hex color — used for soft accent backgrounds/badges. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------ Accent hue ------------------------------- */

/**
 * The accent is a freely-chosen hue rather than one of four presets.
 * Saturation and lightness are held fixed so every hue lands at roughly the
 * same vibrancy as the old palette — these are Rose (#E6488E) converted to
 * HSL, so the default hue looks exactly like the app always has.
 */
export const ACCENT_SATURATION = 0.76;
export const ACCENT_LIGHTNESS = 0.59;

/** Hue of the former `rose` default, so existing installs look unchanged. */
export const DEFAULT_ACCENT_HUE = 333;

/** The four legacy presets as hues — used to migrate saved preferences. */
export const LEGACY_ACCENT_HUES: Record<AccentKey, number> = {
  rose: 333,
  coral: 351,
  lavender: 258,
  blue: 216,
};

/** Accent hex for a hue on the colour wheel (0–360). */
export function accentFromHue(
  hue: number,
  s = ACCENT_SATURATION,
  l = ACCENT_LIGHTNESS,
): string {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  const to255 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/* --------------------------- Scheme cross-fade --------------------------- */

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Blend two hex colours. `t` of 0 returns `from`, 1 returns `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  const mix = (a: number, b: number) =>
    Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
