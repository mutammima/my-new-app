import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DANGER = '#E5484D';

/**
 * A themed yes/no confirmation, replacing the OS `Alert.alert` for destructive
 * actions so they look like the rest of DuoNotes instead of a system dialog.
 *
 * `transparent` is deliberate (and matches PinModal): it maps to
 * `UIModalPresentationOverFullScreen`, which is what lets the dialog appear
 * over a screen that is ITSELF a presented modal — `note/[id]` is declared
 * `presentation: 'modal'`, so a plain fullScreen presentation from here can be
 * refused by UIKit and silently never show.
 */
export function ConfirmModal({
  visible,
  icon = 'trash-outline',
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const accent = destructive ? DANGER : theme.accent;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      {/* Tapping the dimmed backdrop cancels, matching the platform habit. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow taps on the card itself so they don't bubble up and dismiss. */}
        <Pressable
          style={[styles.card, { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.iconWrap, { backgroundColor: destructive ? '#E5484D22' : theme.accentSoft }]}>
            <Ionicons name={icon} size={26} color={accent} />
          </View>

          <ThemedText type="subtitle" style={styles.center}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {message}
          </ThemedText>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText style={styles.buttonText}>{cancelLabel}</ThemedText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText style={[styles.buttonText, styles.confirmText]}>{confirmLabel}</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.three },
  button: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  confirmText: { color: '#fff' },
});
