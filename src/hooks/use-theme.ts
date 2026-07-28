/**
 * Colors for the scheme currently in effect, with the chosen accent hue merged
 * in as `accent` (solid), `accentSoft` (translucent tint) and `onAccent` (text
 * on an accent fill). Respects the user's Appearance preferences.
 *
 * During a light↔dark switch the two palettes are blended by the provider's
 * cross-fade progress, so every colour eases across instead of snapping. Once
 * the fade completes this returns the plain palette again (and skips the
 * blending work entirely).
 */

import { accentFromHue, Colors, hexToRgba, mixHex } from '@/constants/theme';
import { useAccentHue, useSchemeFade } from '@/context/theme-context';

export function useTheme() {
  const hue = useAccentHue();
  const { from, to, progress } = useSchemeFade();
  const accent = accentFromHue(hue);

  const palette =
    progress >= 1 || from === to
      ? Colors[to]
      : {
          text: mixHex(Colors[from].text, Colors[to].text, progress),
          background: mixHex(Colors[from].background, Colors[to].background, progress),
          backgroundElement: mixHex(
            Colors[from].backgroundElement,
            Colors[to].backgroundElement,
            progress,
          ),
          backgroundSelected: mixHex(
            Colors[from].backgroundSelected,
            Colors[to].backgroundSelected,
            progress,
          ),
          textSecondary: mixHex(Colors[from].textSecondary, Colors[to].textSecondary, progress),
        };

  return {
    ...palette,
    accent,
    // The soft tint's alpha also differs per scheme, so ease it across too.
    accentSoft: hexToRgba(
      accent,
      progress >= 1 || from === to
        ? to === 'dark'
          ? 0.22
          : 0.14
        : (from === 'dark' ? 0.22 : 0.14) +
          ((to === 'dark' ? 0.22 : 0.14) - (from === 'dark' ? 0.22 : 0.14)) * progress,
    ),
    onAccent: '#ffffff',
  };
}
