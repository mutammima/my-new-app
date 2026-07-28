import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * We use Expo Router's cross-platform JS `Tabs` (rather than the iOS-only
 * native tabs) so the app also runs in Expo Go on any device and on the web.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { unseenSharedCount } = useNotes();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.backgroundSelected,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: 'Shared',
          // Only your partner's changes badge this — your own edits mark
          // themselves seen as you make them.
          tabBarBadge: unseenSharedCount > 0 ? unseenSharedCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.accent, color: theme.onAccent },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
