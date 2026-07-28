import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A single-field "enter a value and submit" sheet — the shared shape behind
 * both Settings > Link partner and Settings > Your name, so the two flows
 * stay in lockstep instead of drifting as independently-copied modals.
 */
export function PromptModal({
  visible,
  icon,
  title,
  subtitle,
  value,
  onChangeValue,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  error,
  submitLabel,
  savingLabel,
  submitting,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  error: string | null;
  submitLabel: string;
  savingLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <ThemedView style={styles.modal}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.body, { paddingTop: insets.top }]}>
            <View style={[styles.header, { top: insets.top + Spacing.two }]}>
              <Pressable onPress={onCancel} hitSlop={12}>
                <ThemedText type="link" style={{ color: theme.accent }}>
                  Cancel
                </ThemedText>
              </Pressable>
            </View>

            <Ionicons name={icon} size={40} color={theme.accent} />
            <ThemedText type="subtitle" style={styles.center}>
              {title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {subtitle}
            </ThemedText>

            <TextInput
              value={value}
              onChangeText={onChangeValue}
              placeholder={placeholder}
              placeholderTextColor={theme.textSecondary}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {error && (
              <ThemedText type="small" style={{ color: '#E5484D' }}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={onSubmit}
              disabled={submitting || !value.trim()}
              style={({ pressed }) => [
                styles.submit,
                { backgroundColor: theme.accent, opacity: pressed || submitting || !value.trim() ? 0.6 : 1 },
              ]}>
              <ThemedText style={styles.submitText}>{submitting ? savingLabel : submitLabel}</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modal: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  // `top` is supplied inline from the live safe-area inset — a fixed value
  // collides with the status bar / Dynamic Island inside a modal.
  header: { position: 'absolute', left: Spacing.four },
  center: { textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  submit: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
