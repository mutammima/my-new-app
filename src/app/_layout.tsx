import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppLockGate } from '@/components/app-lock-gate';
import { ConfigNotice } from '@/components/config-notice';
import { AppLockProvider } from '@/context/app-lock-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ThemePreferenceProvider, useThemeScheme } from '@/context/theme-context';
import { NotesProvider } from '@/context/notes-context';
import { enableAppSwitcherPrivacy } from '@/lib/privacy-screen';
import { isSupabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

// Install the native app-switcher cover as early as possible — before any
// note can be opened, and independent of React's render timing. See
// src/lib/privacy-screen.ts for why this cannot be done from a component.
enableAppSwitcherPrivacy();

/**
 * Chooses which routes are reachable based on auth state. Expo Router's
 * `Stack.Protected` guard automatically redirects away from screens the user
 * isn't allowed to see, so we never render the tabs to a signed-out user.
 */
function RootNavigator() {
  const { user, initializing } = useAuth();

  // Keep the splash overlay up until we know whether a session was restored.
  if (initializing) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="note/[id]"
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <ThemedRoot />
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Reads the resolved theme so the whole app (and the nav bar) reflects the
 *  user's Light / Dark / System choice. */
function ThemedRoot() {
  const scheme = useThemeScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {isSupabaseConfigured ? (
        <AuthProvider>
          <NotesProvider>
            <AppLockProvider>
              <AppLockGate>
                <RootNavigator />
              </AppLockGate>
            </AppLockProvider>
          </NotesProvider>
        </AuthProvider>
      ) : (
        <ConfigNotice />
      )}
    </ThemeProvider>
  );
}
