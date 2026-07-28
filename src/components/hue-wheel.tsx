import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { accentFromHue, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 220;
const RING = 26;
/** Number of wedges drawn around the ring. 60 is smooth at this size. */
const STEPS = 60;

const RADIUS = SIZE / 2;
const KNOB = 26;

/**
 * A colour wheel for picking the accent hue, replacing the previous four fixed
 * swatches. Drag anywhere on (or inside) the ring and the hue follows your
 * finger; the centre previews the resulting accent.
 *
 * Drawn with plain Views rather than SVG or Skia: the app already avoids
 * pulling extra rendering dependencies into this screen, and a ring of rotated
 * wedges is enough for a smooth gradient at this size.
 */
export function HueWheel({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (hue: number) => void;
}) {
  const theme = useTheme();
  const accent = accentFromHue(hue);

  const wedges = useMemo(
    () =>
      Array.from({ length: STEPS }, (_, i) => {
        const h = (i / STEPS) * 360;
        return { h, color: accentFromHue(h), rotate: `${h}deg` };
      }),
    [],
  );

  /** Convert a touch inside the wheel to a hue (0° at 12 o'clock, clockwise). */
  function hueFor(x: number, y: number): number {
    const dx = x - RADIUS;
    const dy = y - RADIUS;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return ((deg + 90) % 360 + 360) % 360;
  }

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => onChange(hueFor(e.x, e.y)))
        .onUpdate((e) => onChange(hueFor(e.x, e.y))),
    [onChange],
  );

  // Knob position on the ring's centre-line.
  const knobAngle = ((hue - 90) * Math.PI) / 180;
  const knobR = RADIUS - RING / 2;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={pan}>
        <View style={styles.wheel}>
          {wedges.map((w) => (
            <View
              key={w.h}
              style={[styles.wedgeWrap, { transform: [{ rotate: w.rotate }] }]}
              pointerEvents="none">
              <View style={[styles.wedge, { backgroundColor: w.color }]} />
            </View>
          ))}

          {/* Punch out the middle so the ring reads as a ring, and show the
              currently-selected accent in the hole. */}
          <View
            style={[styles.hole, { backgroundColor: theme.background }]}
            pointerEvents="none">
            <View style={[styles.preview, { backgroundColor: accent }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {Math.round(hue)}°
            </ThemedText>
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.knob,
              {
                backgroundColor: accent,
                borderColor: theme.background,
                left: RADIUS + knobR * Math.cos(knobAngle) - KNOB / 2,
                top: RADIUS + knobR * Math.sin(knobAngle) - KNOB / 2,
              },
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: Spacing.three },
  wheel: { width: SIZE, height: SIZE, borderRadius: RADIUS, overflow: 'hidden' },
  // Each wedge is a full-height sliver rotated about the wheel's centre.
  wedgeWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
  },
  wedge: {
    width: (SIZE * Math.PI) / STEPS + 2, // slight overlap so no seams show
    height: SIZE / 2,
  },
  hole: {
    position: 'absolute',
    left: RING,
    top: RING,
    width: SIZE - RING * 2,
    height: SIZE - RING * 2,
    borderRadius: (SIZE - RING * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  preview: { width: 56, height: 56, borderRadius: 28 },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 3,
  },
});
