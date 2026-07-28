import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ConfirmModal } from '@/components/confirm-modal';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCollections } from '@/context/collections-context';
import { useNotes } from '@/context/notes-context';
import { useTheme } from '@/hooks/use-theme';
import { htmlToPlain } from '@/lib/markdown';
import type { Note } from '@/lib/types';

/**
 * One row in a note list. Swipe left to reveal Pin, File (only when the user
 * has created at least one collection) and Delete.
 *
 * Shared by both the flat list (Shared tab) and the collapsible collection
 * view (Notes tab) so the two can't drift apart.
 */
export function NoteRow({ note }: { note: Note }) {
  const theme = useTheme();
  const router = useRouter();
  const { deleteNote, isUnseen, isPinned, togglePinned } = useNotes();
  const { collections, collectionOf, assign } = useCollections();
  const locked = note.lockType !== 'none';
  const updated = isUnseen(note);
  const pinned = isPinned(note.id);
  const [confirming, setConfirming] = useState(false);
  const [filing, setFiling] = useState(false);
  const swipeRef = useRef<SwipeableMethods>(null);

  const preview = locked ? 'Locked — tap to unlock' : htmlToPlain(note.body) || 'No additional text';
  const currentCollection = collectionOf(note.id);

  function renderActions() {
    return (
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            togglePinned(note.id);
            swipeRef.current?.close();
          }}
          style={[styles.action, { backgroundColor: theme.accent }]}>
          <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={20} color={theme.onAccent} />
          <ThemedText type="small" style={{ color: theme.onAccent }}>
            {pinned ? 'Unpin' : 'Pin'}
          </ThemedText>
        </Pressable>

        {collections.length > 0 && (
          <Pressable
            onPress={() => setFiling(true)}
            style={[styles.action, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="folder-outline" size={20} color={theme.text} />
            <ThemedText type="small">File</ThemedText>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            // Leave the row open behind the dialog so it stays obvious which
            // note is about to be deleted; it closes on cancel.
            setConfirming(true);
          }}
          style={[styles.action, styles.deleteAction]}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <ThemedText type="small" style={styles.deleteLabel}>
            Delete
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      renderRightActions={renderActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}>
      <ConfirmModal
        visible={confirming}
        title="Delete note?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => {
          setConfirming(false);
          swipeRef.current?.close();
        }}
        onConfirm={() => {
          setConfirming(false);
          deleteNote(note.id);
        }}
      />

      {/* Filing picker — a light sheet rather than a full modal, since it's a
          short list and the choice is reversible. */}
      {filing && (
        <View style={[styles.filePicker, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Move to
          </ThemedText>
          {collections.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                assign(note.id, c.id);
                setFiling(false);
                swipeRef.current?.close();
              }}
              style={styles.fileOption}>
              <Ionicons
                name={currentCollection === c.id ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={currentCollection === c.id ? theme.accent : theme.textSecondary}
              />
              <ThemedText type="small">{c.name}</ThemedText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              assign(note.id, null);
              setFiling(false);
              swipeRef.current?.close();
            }}
            style={styles.fileOption}>
            <Ionicons
              name={!currentCollection ? 'radio-button-on' : 'radio-button-off'}
              size={16}
              color={!currentCollection ? theme.accent : theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              None
            </ThemedText>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
        onLongPress={() => setConfirming(true)}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <View style={styles.rowMain}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.rowTitle}>
            {note.title.trim() || 'New Note'}
          </ThemedText>
          <View style={styles.rowSubtitle}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatWhen(note.updatedAt)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.preview}>
              {preview}
            </ThemedText>
          </View>
        </View>
        <View style={styles.badges}>
          {pinned && <Ionicons name="pin" size={14} color={theme.accent} />}
          {updated && (
            <View style={[styles.updatedDot, { backgroundColor: theme.accent }]}>
              <Ionicons name="sparkles" size={11} color={theme.onAccent} />
            </View>
          )}
          {note.isShared && <Ionicons name="people" size={16} color={theme.textSecondary} />}
          {locked && (
            <Ionicons
              name={note.lockType === 'biometric' ? 'finger-print' : 'lock-closed'}
              size={16}
              color={theme.accent}
            />
          )}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'stretch' },
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
  filePicker: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  fileOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15 },
  rowSubtitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { flex: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  updatedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
