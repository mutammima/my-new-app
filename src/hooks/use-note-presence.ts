/**
 * "Your partner is here — and typing" presence for an open note.
 *
 * Scope note: this reports that the partner has the SAME note open, and whether
 * they are actively typing right now. It does NOT report where their caret is,
 * and it does not stream their text keystroke by keystroke. A live caret would
 * require the note body to be a shared CRDT; today the body is a single
 * last-write-wins column, so a caret offset computed against one revision would
 * point at the wrong character in another. Their finished edits arrive through
 * the ordinary note sync (see `remoteHtml` in `rich-note-editor.tsx`, which
 * applies them only while your own caret is elsewhere).
 *
 * Built on Supabase Realtime presence: each viewer tracks itself on a per-note
 * channel and everyone receives the resulting roster.
 *
 * Cost note — this project has blown its egress budget once already. Typing
 * state is published on TRANSITIONS ONLY: one `track()` when a burst starts and
 * one when it goes idle, never one per keystroke. A partner writing a long
 * paragraph without pausing costs exactly two messages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

/** Silence that ends a typing burst. Long enough to survive thinking mid-sentence. */
const TYPING_IDLE_MS = 2500;

export interface PresentPartner {
  name: string;
  /** Their accent hue, so the indicator can use THEIR colour. */
  hue: number;
  /** They have pressed a key within the last few seconds. */
  typing: boolean;
}

export interface NotePresence {
  partner: PresentPartner | null;
  /**
   * Call on every local keystroke. Cheap to call at any rate — it only reaches
   * the network when the typing/idle state actually flips.
   */
  reportTyping: () => void;
}

export function useNotePresence(noteId: string | undefined, myHue: number): NotePresence {
  const { user } = useAuth();
  const userId = user?.id;
  const userName = user?.name;
  const [partner, setPartner] = useState<PresentPartner | null>(null);

  // Written by the effect, read by `reportTyping` — which must not be
  // re-created on every keystroke, so it reads live values from refs instead of
  // closing over them.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityRef = useRef({ name: userName, hue: myHue });
  // Kept fresh in an effect, not during render. The initial value above already
  // covers the first subscribe, and this effect is declared before the channel
  // effect below so a later name/hue change lands before anything publishes it.
  useEffect(() => {
    identityRef.current = { name: userName, hue: myHue };
  }, [userName, myHue]);

  const publish = useCallback((typing: boolean) => {
    typingRef.current = typing;
    const { name, hue } = identityRef.current;
    void channelRef.current?.track({ name: name || 'Your partner', hue, typing });
  }, []);

  const reportTyping = useCallback(() => {
    if (!channelRef.current) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      if (typingRef.current) publish(false);
    }, TYPING_IDLE_MS);
    // Transition only — a burst of keystrokes sends nothing after the first.
    if (!typingRef.current) publish(true);
  }, [publish]);

  useEffect(() => {
    // Nothing to subscribe to. The "no partner" result is DERIVED at the
    // return below rather than written to state here, so this effect never
    // sets state synchronously just to clear it.
    if (!noteId || !userId) return;

    const channel = supabase.channel(`note-presence:${noteId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;
    typingRef.current = false;

    const readRoster = () => {
      const roster = channel.presenceState<{ name: string; hue: number; typing?: boolean }>();
      // Anyone on this channel who isn't me is the partner viewing it too.
      for (const [key, entries] of Object.entries(roster)) {
        if (key === userId) continue;
        const entry = entries[0];
        if (entry) {
          setPartner({
            name: entry.name ?? 'Your partner',
            hue: entry.hue ?? 0,
            // Absent on an older client that predates typing state — read as
            // "viewing", which is exactly what that client means.
            typing: entry.typing === true,
          });
          return;
        }
      }
      setPartner(null);
    };

    channel
      .on('presence', { event: 'sync' }, readRoster)
      .on('presence', { event: 'join' }, readRoster)
      .on('presence', { event: 'leave' }, readRoster)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // The accent is a local-only preference, so it is carried in the
          // presence payload rather than read from the database.
          const { name, hue } = identityRef.current;
          void channel.track({ name: name || 'Your partner', hue, typing: false });
        }
      });

    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      typingRef.current = false;
      channelRef.current = null;
      // Removing the channel untracks us, so the partner stops seeing a stale
      // "typing…" the moment this note closes rather than TYPING_IDLE_MS later.
      void supabase.removeChannel(channel);
      setPartner(null);
    };
  }, [noteId, userId, myHue]);

  return {
    // Derived, so leaving a note reports "nobody" immediately even if the last
    // roster update hasn't been cleared yet.
    partner: noteId && userId ? partner : null,
    reportTyping,
  };
}
