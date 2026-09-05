import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { AuthActionError, useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const theme = useTheme();
  const { signIn, signUp, resendConfirmation } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when sign-in failed only because the address has not been confirmed.
  // That is the one failure the user can act on from here, so it is the one
  // that earns an extra control rather than just red text.
  const [unconfirmed, setUnconfirmed] = useState(false);

  const isSignup = mode === 'signup';

  async function submit() {
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    setBusy(true);
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUp(name, email, password);
        if (needsConfirmation) {
          setMode('signin');
          setNotice('Account created! Check your email to confirm, then sign in.');
        }
        // Otherwise the root navigator's guard swaps us into the tabs.
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      // Supabase's own wording here is "Email not confirmed", which reads like a
      // dead end. Say what happened and offer the way out instead.
      if (e instanceof AuthActionError && e.code === 'email_not_confirmed') {
        setUnconfirmed(true);
        setError('This account has not been confirmed yet. Check your email for the link.');
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resendConfirmation(email);
      setUnconfirmed(false);
      setNotice('Confirmation email sent. Check your inbox, including spam.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.brand}>
              DuoNotes
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.tagline}>
              Shared notes for two — lockable, private, yours.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.form}>
            {isSignup && (
              <Field
                label="Name"
                theme={theme}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sam"
                autoCapitalize="words"
              />
            )}
            <Field
              label="Email"
              theme={theme}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="Password"
              theme={theme}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
            />

            {notice && (
              <ThemedText type="small" style={{ color: '#30A46C' }}>
                {notice}
              </ThemedText>
            )}
            {error && (
              <ThemedText type="small" style={[styles.error, { color: '#E5484D' }]}>
                {error}
              </ThemedText>
            )}
            {unconfirmed && (
              <Pressable onPress={resend} disabled={busy} style={styles.resendButton}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Resend confirmation email
                </ThemedText>
              </Pressable>
            )}

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.accent, opacity: pressed || busy ? 0.7 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>
                  {isSignup ? 'Create account' : 'Sign in'}
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setError(null);
                setNotice(null);
                setUnconfirmed(false);
                setMode(isSignup ? 'signin' : 'signup');
              }}
              style={styles.switchButton}>
              <ThemedText type="small" themeColor="textSecondary">
                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  {isSignup ? 'Sign in' : 'Sign up'}
                </ThemedText>
              </ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  theme: ReturnType<typeof useTheme>;
};

// Defined at module scope so it keeps a stable identity across AuthScreen
// re-renders. If this lived inside AuthScreen, every keystroke would remount
// the TextInput and drop keyboard focus.
function Field({ label, style, theme, ...inputProps }: FieldProps) {
  return (
    <ThemedView style={styles.fieldGroup}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...inputProps}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  header: { alignItems: 'center', gap: Spacing.two },
  brand: { fontSize: 40, lineHeight: 44 },
  tagline: { textAlign: 'center' },
  form: { gap: Spacing.three },
  fieldGroup: { gap: Spacing.one },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  error: {},
  primaryButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendButton: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  switchButton: { alignItems: 'center', paddingVertical: Spacing.two },
});
