/**
 * "Your partner is here" presence for an open note.
 *
 * Scope note: this reports only that the partner has the SAME note open — not
 * where their caret is, and not their text as they type. A live cursor would
 * require the note body to be a shared CRDT; today the editor deliberately
 * does not apply a partner's incoming edits to an open note (see
 * `src/app/note/[id].tsx`, which re-syncs local state on `note.id` only, so
 * remote changes never clobber what you are typing). A caret drawn against a
 * document you are not actually seeing would point at the wrong place, so
 * presence is the honest version of this feature.
 *
 * Built on Supabase Realtime presence: each viewer tracks itself on a
 * per-note channel and everyone receives the resulting roster.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

export interface PresentPartner {
  name: string;
  /** Their accent hue, so the indicator can use THEIR colour. */
  hue: number;
}

export function useNotePresence(noteId: string | undefined, myHue: number): PresentPartner | null {
  const { user } = useAuth();
  const [partner, setPartner] = useState<PresentPartner | null>(null);

  useEffect(() => {
    // Nothing to subscribe to. The "no partner" result is DERIVED at the
    // return below rather than written to state here, so this effect never
    // sets state synchronously just to clear it.
    if (!noteId || !user) return;

    const channel = supabase.channel(`note-presence:${noteId}`, {
      config: { presence: { key: user.id } },
    });

    const readRoster = () => {
      const roster = channel.presenceState<{ name: string; hue: number }>();
      // Anyone on this channel who isn't me is the partner viewing it too.
      for (const [key, entries] of Object.entries(roster)) {
        if (key === user.id) continue;
        const entry = entries[0];
        if (entry) {
          setPartner({ name: entry.name ?? 'Your partner', hue: entry.hue ?? 0 });
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
          channel.track({ name: user.name || 'Your partner', hue: myHue });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setPartner(null);
    };
  }, [noteId, user, myHue]);

  // Derived, so leaving a note reports "nobody" immediately even if the last
  // roster update hasn't been cleared yet.
  return noteId && user ? partner : null;
}
