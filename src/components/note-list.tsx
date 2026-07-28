import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { NoteRow } from '@/components/note-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import { htmlToPlain } from '@/lib/markdown';
import type { Note } from '@/lib/types';

/** Locked notes keep their body hidden from search, same as the row preview does. */
type Searchable = { note: Note; titleLower: string; bodyLower: string };

function buildSearchIndex(notes: Note[]): Searchable[] {
  return notes.map((note) => ({
    note,
    titleLower: note.title.toLowerCase(),
    bodyLower: note.lockType === 'none' ? htmlToPlain(note.body).toLowerCase() : '',
  }));
}

export function NoteList({
  notes,
  emptyLabel,
  emptyIcon = 'document-text-outline',
}: {
  notes: Note[];
  emptyLabel: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { isPinned } = useNotes();

  // Pinned notes float to the top; within each group the caller's existing
  // most-recent-first order is preserved (`sort` is stable in JS).
  const ordered = useMemo(
    () => [...notes].sort((a, b) => Number(isPinned(b.id)) - Number(isPinned(a.id))),
    [notes, isPinned],
  );

  // Plain-text extraction only needs to re-run when the notes themselves
  // change, not on every keystroke — filtering against the cached lowercase
  // text below is a cheap string scan either way.
  const searchIndex = useMemo(() => buildSearchIndex(ordered), [ordered]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return searchIndex.filter((s) => s.titleLower.includes(q) || s.bodyLower.includes(q)).map((s) => s.note);
  }, [searchIndex, query, ordered]);

  if (notes.length === 0) {
    return <EmptyState icon={emptyIcon} theme={theme} text={emptyLabel} />;
  }

  return (
    <>
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="search" size={30} theme={theme} text={`No notes match "${query.trim()}"`} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          renderItem={({ item }) => <NoteRow note={item} />}
        />
      )}
    </>
  );
}

function EmptyState({
  icon,
  size = 34,
  theme,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  theme: ReturnType<typeof useTheme>;
  text: string;
}) {
  return (
    <ThemedView style={styles.empty}>
      <View style={[styles.emptyBadge, { backgroundColor: theme.accentSoft }]}>
        <Ionicons name={icon} size={size} color={theme.accent} />
      </View>
      <ThemedText themeColor="textSecondary" style={styles.emptyText}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'stretch', marginBottom: Spacing.two },
  action: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Spacing.three,
    marginLeft: Spacing.two,
  },
  deleteAction: { backgroundColor: '#E5484D' },
  deleteLabel: { color: '#fff' },
  searchRow: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0, height: '100%' },
  listContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.one, paddingBottom: Spacing.six },
  rowGap: { height: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { flexDirection: 'row', gap: Spacing.two },
  preview: { flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  updatedDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  emptyBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 22 },
});
