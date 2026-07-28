import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfirmModal } from '@/components/confirm-modal';
import { NoteRow } from '@/components/note-row';
import { PromptModal } from '@/components/prompt-modal';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCollections } from '@/context/collections-context';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import { BUILT_IN } from '@/lib/collections';
import type { Note } from '@/lib/types';

interface Group {
  id: string;
  name: string;
  notes: Note[];
  /** Built-in groups can't be renamed or deleted. */
  builtIn: boolean;
}

/**
 * The Notes tab's folder view: collapsible sections, with "Shared" and "Your
 * notes" always present and any custom collections in between.
 *
 * A note filed into a custom collection appears ONLY there, so it is never
 * listed twice; anything unfiled falls back to Shared or Your notes, so no
 * note can be hidden by being filed away.
 */
export function CollectionList({ notes }: { notes: Note[] }) {
  const theme = useTheme();
  const { isPinned } = useNotes();
  const {
    collections,
    collectionOf,
    isCollapsed,
    toggleCollapsed,
    createCollection,
    deleteCollection,
  } = useCollections();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => {
    const byPin = (a: Note, b: Note) => Number(isPinned(b.id)) - Number(isPinned(a.id));
    const custom = new Map<string, Note[]>(collections.map((c) => [c.id, []]));
    const shared: Note[] = [];
    const mine: Note[] = [];

    for (const note of notes) {
      const cid = collectionOf(note.id);
      if (cid && custom.has(cid)) {
        custom.get(cid)!.push(note);
      } else if (note.isShared) {
        shared.push(note);
      } else {
        mine.push(note);
      }
    }

    return [
      { id: BUILT_IN.shared, name: 'Shared notes', notes: shared.sort(byPin), builtIn: true },
      ...collections.map((c) => ({
        id: c.id,
        name: c.name,
        notes: (custom.get(c.id) ?? []).sort(byPin),
        builtIn: false,
      })),
      { id: BUILT_IN.mine, name: 'Your notes', notes: mine.sort(byPin), builtIn: true },
    ];
  }, [notes, collections, collectionOf, isPinned]);

  const pendingDelete = collections.find((c) => c.id === deletingId);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {groups.map((group) => {
        const collapsed = isCollapsed(group.id);
        return (
          <View key={group.id} style={styles.group}>
            <Pressable
              onPress={() => toggleCollapsed(group.id)}
              style={({ pressed }) => [styles.header, pressed && { opacity: 0.6 }]}>
              <Ionicons
                name={collapsed ? 'chevron-forward' : 'chevron-down'}
                size={16}
                color={theme.textSecondary}
              />
              <ThemedText type="smallBold">{group.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {group.notes.length}
              </ThemedText>
              {!group.builtIn && (
                <Pressable
                  onPress={() => setDeletingId(group.id)}
                  hitSlop={10}
                  style={styles.headerAction}>
                  <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
                </Pressable>
              )}
            </Pressable>

            {!collapsed &&
              (group.notes.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyGroup}>
                  {group.builtIn ? 'Nothing here yet.' : 'Swipe a note to file it here.'}
                </ThemedText>
              ) : (
                group.notes.map((note) => (
                  <View key={note.id} style={styles.rowGap}>
                    <NoteRow note={note} />
                  </View>
                ))
              ))}
          </View>
        );
      })}

      <Pressable
        onPress={() => {
          setNewName('');
          setCreating(true);
        }}
        style={({ pressed }) => [
          styles.addCollection,
          { borderColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 },
        ]}>
        <Ionicons name="add" size={18} color={theme.accent} />
        <ThemedText type="small" style={{ color: theme.accent }}>
          New collection
        </ThemedText>
      </Pressable>

      <PromptModal
        visible={creating}
        icon="folder-outline"
        title="New collection"
        subtitle="Group notes however you like. Only you see your collections."
        value={newName}
        onChangeValue={setNewName}
        placeholder="e.g. Trips, Recipes"
        error={null}
        submitLabel="Create"
        savingLabel="Creating…"
        submitting={false}
        onSubmit={() => {
          createCollection(newName);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />

      <ConfirmModal
        visible={pendingDelete != null}
        icon="folder-outline"
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        message="The collection is removed. Your notes stay — they move back to Shared or Your notes."
        confirmLabel="Delete"
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) deleteCollection(deletingId);
          setDeletingId(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingBottom: 120 },
  group: { marginBottom: Spacing.three },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  headerAction: { marginLeft: 'auto' },
  emptyGroup: { paddingVertical: Spacing.two, paddingLeft: Spacing.four },
  rowGap: { marginBottom: Spacing.two },
  addCollection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginTop: Spacing.two,
  },
});
