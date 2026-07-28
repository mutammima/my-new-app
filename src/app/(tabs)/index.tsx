import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollectionList } from '@/components/collection-list';
import { SyncBanner } from '@/components/sync-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import { pickGreeting } from '@/utils/greeting';

export default function NotesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { notes: allNotes, myNotes, createNote } = useNotes();

  const firstName = (user?.name ?? '').trim().split(' ')[0];
  const greeting = firstName ? pickGreeting(firstName) : 'Your notes';

  async function onCompose() {
    const note = await createNote();
    if (note) router.push({ pathname: '/note/[id]', params: { id: note.id } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.hero, { backgroundColor: theme.accentSoft }]}>
          <View style={styles.heroTitleRow}>
            <ThemedText type="subtitle">{greeting}</ThemedText>
            <Ionicons name="heart" size={22} color={theme.accent} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {myNotes.length === 0
              ? 'A cozy place for the two of you'
              : `${myNotes.length} ${myNotes.length === 1 ? 'note' : 'notes'}`}
          </ThemedText>
        </View>

        <SyncBanner />

        <CollectionList notes={allNotes} />

        <Pressable
          onPress={onCompose}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.accent, shadowColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Ionicons name="create-outline" size={26} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  hero: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: 2,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
});
