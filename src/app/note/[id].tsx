import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/confirm-modal';
import { LinkPartnerSheet } from '@/components/link-partner-sheet';
import { PinModal } from '@/components/pin-modal';
import { RichNoteEditor } from '@/components/rich-note-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accentFromHue, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useNotes } from '@/context/notes-context';
import { useAccentHue } from '@/context/theme-context';
import { useNotePresence } from '@/hooks/use-note-presence';
import { useTheme } from '@/hooks/use-theme';
import { setLockedNotePrivacy } from '@/lib/privacy-screen';
import {
  authenticateBiometric,
  getBiometricStatus,
  isPinSet,
  setPin,
  verifyPin,
} from '@/lib/security';
import type { LockType } from '@/lib/types';

export default function NoteEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNote, updateNote, deleteNote, toggleShared, setLock, loading, markSeen } = useNotes();
  const { user } = useAuth();

  const note = getNote(id);

  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [unlocked, setUnlocked] = useState(note ? note.lockType === 'none' : true);
  // `pinTask` drives the shared PinModal for either unlocking or enabling a PIN.
  const [pinTask, setPinTask] = useState<'unlock' | 'enable' | null>(null);
  // Invite/link-partner sheet, opened when you share without a partner linked.
  const [showLink, setShowLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const myHue = useAccentHue();
  const partnerHere = useNotePresence(note?.isShared ? id : undefined, myHue);

  const locked = note ? note.lockType !== 'none' : false;

  // If the note was deleted (or never existed), leave — but only once notes
  // have finished loading, so we don't bounce during the initial fetch.
  useEffect(() => {
    if (!loading && !note) router.back();
  }, [loading, note, router]);

  // While this note is open you're by definition looking at it, so keep it
  // marked read — including when a partner edit lands mid-view.
  useEffect(() => {
    if (note) markSeen(id);
  }, [id, note?.updatedAt, markSeen, note]);

  // Sync local fields when a (different) note becomes available. Keyed on the
  // id only, so realtime refreshes of the same note never clobber typing.
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setBody(note.body);
      setUnlocked(note.lockType === 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Re-lock when the user genuinely leaves the app — 'background', never
  // 'inactive'.
  //
  // This deliberately no longer tries to also be the app-switcher cover. The
  // previous version fired on any non-'active' state to beat the snapshot, but
  // the system Face ID sheet ALSO makes the app 'inactive': unlocking the note
  // immediately re-locked it, and combined with the whole-app gate the two
  // could bounce off each other so the note could never be opened at all.
  // Hiding the content from the switcher is now the native privacy cover's job
  // (src/lib/privacy-screen.ts), which is race-free; this listener is purely
  // about *authorization*, so 'background' is the correct — and safe — signal.
  useEffect(() => {
    if (!locked) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') setUnlocked(false);
    });
    return () => sub.remove();
  }, [locked]);

  // While a locked note is actually readable on screen, harden the window
  // itself: this is the layer that covers a *presented* screen (note/[id] is a
  // native modal, which the app-switcher blur alone slides underneath), and it
  // also keeps locked content out of screenshots. Released as soon as the note
  // closes or re-locks, so ordinary screens stay screenshot-able.
  useEffect(() => {
    const shouldHarden = locked && unlocked;
    setLockedNotePrivacy(shouldHarden);
    return () => {
      if (shouldHarden) setLockedNotePrivacy(false);
    };
  }, [locked, unlocked]);

  // The OTHER half of "re-lock when I leave" — navigating back to the list —
  // is already covered without extra code: `note/[id]` is pushed as a modal
  // stack screen, which unmounts on pop, and `unlocked`'s initial value
  // (above) is computed fresh from `note.lockType` on every mount. Verified
  // on-device: unlock a note, back out to the list, back in — locked again.

  // Debounce writes so we don't hit the database on every keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title?: string; body?: string }>({});

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (Object.keys(pending.current).length > 0) {
      updateNote(id, pending.current);
      pending.current = {};
    }
  }, [id, updateNote]);

  const persist = useCallback(
    (patch: { title?: string; body?: string }) => {
      pending.current = { ...pending.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Short debounce so edits reach the server (and the partner) quickly
      // without hammering the DB on every keystroke.
      saveTimer.current = setTimeout(flush, 300);
    },
    [flush],
  );

  // Flush any pending edit when leaving the screen.
  useEffect(() => flush, [flush]);

  // Set once the user actively dismisses a biometric prompt, so we never
  // re-prompt them in a loop they can't escape. Cleared when they ask again.
  const declinedRef = useRef(false);

  const tryBiometric = useCallback(async () => {
    declinedRef.current = false;
    const ok = await authenticateBiometric('Unlock this note');
    if (ok) setUnlocked(true);
    else declinedRef.current = true;
  }, []);

  // Counts genuine returns from the background, so a re-locked note can
  // re-prompt. Keyed on 'background' (not 'inactive') for the same reason as
  // the re-lock above: the Face ID sheet itself makes the app 'inactive', and
  // treating that as a return would re-prompt on top of the live prompt.
  const [resumeToken, setResumeToken] = useState(0);
  useEffect(() => {
    let wasBackgrounded = false;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') wasBackgrounded = true;
      else if (next === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        setResumeToken((t) => t + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-prompt biometrics when a biometric-locked note opens, and again after
  // a real return from the background — but never after the user declined,
  // which is what would otherwise make the prompt impossible to dismiss.
  useEffect(() => {
    if (note?.lockType === 'biometric' && !unlocked && !declinedRef.current) {
      tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, resumeToken]);

  // `note` is narrowed to non-null below. These handlers are `const` arrows (not
  // hoisted `function` declarations) so the narrowing flows into their closures.
  if (!note) return null;
  const activeNote = note;

  const changeBody = (t: string) => {
    setBody(t);
    persist({ body: t });
  };

  // The people icon: if there's no partner yet, invite one first; otherwise
  // just toggle sharing.
  const onSharePress = () => {
    if (!activeNote.isShared && !user?.partnerId) {
      setShowLink(true);
      return;
    }
    toggleShared(activeNote.id);
  };

  const applyLock = async (type: LockType) => {
    await setLock(activeNote.id, type);
  };

  const enablePinLock = async () => {
    if (await isPinSet()) {
      await applyLock('pin');
    } else {
      // No device PIN yet — collect one, then lock.
      setPinTask('enable');
    }
  };

  const enableBiometricLock = async () => {
    const status = await getBiometricStatus();
    if (!status.available) {
      Alert.alert('Not available', 'This device has no biometric sensor.');
      return;
    }
    if (!status.enrolled) {
      Alert.alert(
        `${status.label} not set up`,
        `Add ${status.label} in your system settings first, then try again.`,
      );
      return;
    }
    const ok = await authenticateBiometric(`Confirm ${status.label} to lock this note`);
    if (ok) await applyLock('biometric');
  };

  const chooseLock = () => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: activeNote.lockType === 'pin' ? '🔒 PIN lock (on)' : 'PIN lock', onPress: enablePinLock },
      {
        text: activeNote.lockType === 'biometric' ? '🔒 Biometric lock (on)' : 'Biometric lock',
        onPress: enableBiometricLock,
      },
    ];
    if (activeNote.lockType !== 'none') {
      options.push({ text: 'Remove lock', style: 'destructive', onPress: () => applyLock('none') });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Lock note', 'Keep this note hidden until it is unlocked.', options);
  };

  const confirmDelete = () => setDeleting(true);

  const onPinModalSubmit = async (pin: string): Promise<boolean> => {
    if (pinTask === 'unlock') {
      const ok = await verifyPin(pin);
      if (ok) {
        setUnlocked(true);
        setPinTask(null);
      }
      return ok;
    }
    if (pinTask === 'enable') {
      await setPin(pin);
      await applyLock('pin');
      setPinTask(null);
      return true;
    }
    return false;
  };

  const lockIcon = note.lockType === 'biometric' ? 'finger-print' : 'lock-closed';
  const isShared = note.isShared;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerLeft}>
            <Ionicons name="chevron-back" size={24} color={theme.accent} />
            <ThemedText type="link" style={{ color: theme.accent }}>
              Notes
            </ThemedText>
          </Pressable>

          <View style={styles.headerRight}>
            <HeaderIcon
              name={isShared ? 'people' : 'people-outline'}
              active={isShared}
              onPress={onSharePress}
            />
            <HeaderIcon
              name={locked ? lockIcon : 'lock-open-outline'}
              active={locked}
              onPress={chooseLock}
            />
            <HeaderIcon name="trash-outline" onPress={confirmDelete} />
          </View>
        </View>

        {/* Body */}
        {locked && !unlocked ? (
          <LockGate
            lockType={note.lockType}
            onUnlock={() => (note.lockType === 'biometric' ? tryBiometric() : setPinTask('unlock'))}
          />
        ) : (
          <RichNoteEditor initialHtml={body} onChangeHtml={changeBody}>
            <View style={styles.editorHead}>
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  persist({ title: t });
                }}
                placeholder="Title"
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text }]}
                multiline
              />
              {isShared && (
                <View style={styles.sharedBanner}>
                  <Ionicons name="heart" size={14} color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Shared with your partner
                  </ThemedText>
                </View>
              )}
              {partnerHere && (
                // Their theme colour, not yours — so it reads as "them".
                <View style={styles.sharedBanner}>
                  <View
                    style={[styles.presenceDot, { backgroundColor: accentFromHue(partnerHere.hue) }]}
                  />
                  <ThemedText type="small" style={{ color: accentFromHue(partnerHere.hue) }}>
                    {partnerHere.name} is viewing this note
                  </ThemedText>
                </View>
              )}
            </View>
          </RichNoteEditor>
        )}
      </SafeAreaView>

      <PinModal
        visible={pinTask !== null}
        mode={pinTask === 'enable' ? 'set' : 'verify'}
        title={pinTask === 'enable' ? 'Set a PIN' : 'Enter your PIN'}
        onSubmit={onPinModalSubmit}
        onCancel={() => setPinTask(null)}
      />

      <ConfirmModal
        visible={deleting}
        title="Delete note?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false);
          await deleteNote(activeNote.id);
          router.back();
        }}
      />

      <LinkPartnerSheet
        visible={showLink}
        onClose={() => setShowLink(false)}
        onLinked={() => {
          if (!activeNote.isShared) toggleShared(activeNote.id);
        }}
        reason="Link your partner to share this note. Enter the email they signed up with — once linked, this note syncs to their phone."
      />
    </ThemedView>
  );

  function HeaderIcon({
    name,
    onPress,
    active,
  }: {
    name: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    active?: boolean;
  }) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={styles.headerIcon}>
        <Ionicons name={name} size={22} color={active ? theme.accent : theme.text} />
      </Pressable>
    );
  }
}

function LockGate({ lockType, onUnlock }: { lockType: LockType; onUnlock: () => void }) {
  const theme = useTheme();
  const isBio = lockType === 'biometric';
  return (
    <View style={styles.gate}>
      <Ionicons name={isBio ? 'finger-print' : 'lock-closed'} size={56} color={theme.textSecondary} />
      <ThemedText type="subtitle">This note is locked</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.gateText}>
        {isBio
          ? 'Use biometrics to view its contents.'
          : 'Enter your PIN to view its contents.'}
      </ThemedText>
      <Pressable
        onPress={onUnlock}
        style={({ pressed }) => [styles.unlockButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
        <Ionicons name={isBio ? 'finger-print' : 'keypad'} size={20} color="#fff" />
        <ThemedText style={styles.unlockText}>Unlock</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  headerIcon: { padding: Spacing.two },
  editorHead: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  titleInput: { fontSize: 26, fontWeight: '700', paddingTop: Spacing.two },
  sharedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  gateText: { textAlign: 'center' },
  unlockButton: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.three,
  },
  unlockText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
