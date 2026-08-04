/**
 * Offline-first note storage + CRUD for DuoNotes.
 *
 * Notes are cached locally (AsyncStorage) so the app is fully usable without a
 * connection: you can read, create, edit, delete, lock and share notes offline.
 * Every change is applied to local state immediately and recorded in a small
 * persisted "pending" queue. When connectivity returns (detected via
 * `expo-network`) the queue is flushed to Supabase and the server is re-read to
 * reconcile any changes your partner made.
 *
 * Conflict handling is intentionally simple: last write to reach the server
 * wins (mirroring the `updated_at` trigger in `supabase/schema.sql`). Notes you
 * own are pushed with `upsert`; a partner-owned shared note you edited is pushed
 * with `update`, because RLS blocks a non-owner from inserting.
 */

import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';
import { supabase, TABLES } from '@/lib/supabase';
import type { LockType, Note, NoteRow } from '@/lib/types';

interface NotesContextValue {
  notes: Note[];
  myNotes: Note[];
  sharedNotes: Note[];
  loading: boolean;
  /** False when the device has no usable internet connection. */
  isOnline: boolean;
  /** Number of local changes waiting to be uploaded. */
  pendingCount: number;
  getNote: (id: string) => Note | undefined;
  createNote: () => Promise<Note | null>;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'lockType'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleShared: (id: string) => Promise<void>;
  setLock: (id: string, lockType: LockType) => Promise<void>;
  /** Manually push pending changes and pull the latest from the server. */
  syncNow: () => Promise<void>;
  /** True when the note changed (or arrived) since you last opened it — i.e.
   *  your partner touched it. Your own edits mark themselves seen. */
  isUnseen: (note: Note) => boolean;
  /** Record the note as read up to its current `updatedAt`. */
  markSeen: (id: string) => void;
  /** Whether YOU pinned this note to the top (a private, unsynced choice). */
  isPinned: (id: string) => boolean;
  togglePinned: (id: string) => void;
  /** How many shared notes your PARTNER has touched since you last looked —
   *  drives the badge on the Shared tab. Your own edits never count. */
  unseenSharedCount: number;
}

const NotesContext = createContext<NotesContextValue | null>(null);

interface PendingQueue {
  dirty: string[]; // note ids with local edits to upload
  deleted: string[]; // note ids deleted locally, to delete on the server
}

async function probeOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true; // If we can't tell, assume online and let the request decide.
  }
}

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const partnerId = user?.partnerId ?? null;

  const [notes, setNotesState] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Refs let async sync code read current values without stale closures.
  const notesRef = useRef<Note[]>([]);
  const dirtyRef = useRef<Set<string>>(new Set());
  const deletedRef = useRef<Set<string>>(new Set());
  const syncingRef = useRef(false);
  const onlineRef = useRef(true);
  const namesRef = useRef<Record<string, string>>({}); // id -> display name

  // Latest-callback refs so the network/realtime effects don't need to re-bind.
  const syncNowRef = useRef<() => Promise<void>>(async () => {});
  const reconcileRef = useRef<() => Promise<void>>(async () => {});

  // noteId -> the `updatedAt` you last saw. A note whose updatedAt is newer
  // (or that has no entry at all, i.e. it just arrived) counts as unseen.
  const [seen, setSeenState] = useState<Record<string, number>>({});
  const seenRef = useRef<Record<string, number>>({});

  // Pinned note ids. Deliberately LOCAL per person (same shape as `seen`,
  // stored per-uid) rather than a synced column: a shared note may be
  // important to one partner and not the other, and pinning is a personal
  // organisation choice, not shared content.
  const [pinned, setPinnedState] = useState<Record<string, true>>({});
  const pinnedRef = useRef<Record<string, true>>({});

  const notesKey = uid ? `${StorageKeys.notes}.${uid}` : null;
  const pendingKey = uid ? `${StorageKeys.pending}.${uid}` : null;
  const seenKey = uid ? `${StorageKeys.seen}.${uid}` : null;
  const pinnedKey = uid ? `${StorageKeys.pinned}.${uid}` : null;

  const setNotes = useCallback((next: Note[]) => {
    notesRef.current = next;
    setNotesState(next);
  }, []);

  const writeSeen = useCallback(
    (next: Record<string, number>) => {
      seenRef.current = next;
      setSeenState(next);
      if (seenKey) saveJSON(seenKey, next).catch(() => {});
    },
    [seenKey],
  );

  /** Mark a single note read up to its current updatedAt. */
  const markSeen = useCallback(
    (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note) return;
      if (seenRef.current[id] === note.updatedAt) return;
      writeSeen({ ...seenRef.current, [id]: note.updatedAt });
    },
    [writeSeen],
  );

  /** Your own local edits shouldn't badge themselves as "partner updated". */
  const touchSeen = useCallback(
    (id: string, ts: number) => writeSeen({ ...seenRef.current, [id]: ts }),
    [writeSeen],
  );

  const isUnseen = useCallback(
    (note: Note) => (seen[note.id] ?? -1) < note.updatedAt,
    [seen],
  );

  const isPinned = useCallback((id: string) => pinned[id] === true, [pinned]);

  const togglePinned = useCallback(
    (id: string) => {
      const next = { ...pinnedRef.current };
      if (next[id]) delete next[id];
      else next[id] = true;
      pinnedRef.current = next;
      setPinnedState(next);
      if (pinnedKey) saveJSON(pinnedKey, next).catch(() => {});
    },
    [pinnedKey],
  );

  const refreshPendingCount = useCallback(() => {
    setPendingCount(dirtyRef.current.size + deletedRef.current.size);
  }, []);

  const persistCache = useCallback(
    async (list: Note[]) => {
      if (notesKey) await saveJSON(notesKey, list);
    },
    [notesKey],
  );

  const persistPending = useCallback(async () => {
    if (pendingKey) {
      const queue: PendingQueue = { dirty: [...dirtyRef.current], deleted: [...deletedRef.current] };
      await saveJSON(pendingKey, queue);
    }
  }, [pendingKey]);

  const mapRow = useCallback(
    (row: NoteRow): Note => ({
      id: row.id,
      title: row.title,
      body: row.body,
      lockType: row.lock_type,
      isShared: row.is_shared,
      ownerId: row.owner_id,
      ownerName: namesRef.current[row.owner_id] ?? 'Partner',
      updatedAt: new Date(row.updated_at).getTime(),
    }),
    [],
  );

  // Pull the server's notes and merge them with any local pending changes:
  // server rows are the base, local unsynced edits/creates win, local deletes
  // are removed. Throws on any network/query failure so the caller can mark the
  // app offline without discarding the local cache.
  const reconcile = useCallback(async () => {
    if (!user) return;
    const ids = [user.id, user.partnerId].filter(Boolean) as string[];

    // Names change approximately never, so only pay for them when one is
    // actually missing (first load, or a partner who just linked). This used to
    // run on every single reconcile.
    if (ids.some((id) => !namesRef.current[id])) {
      const { data: profiles } = await supabase.from(TABLES.profiles).select('id, name').in('id', ids);
      namesRef.current = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]));
    }

    // Step 1 — the manifest: ids and timestamps ONLY, no bodies. This is still
    // the authoritative set of server rows, so anything absent from it is a
    // delete, exactly as before; it just costs ~40 bytes a note instead of the
    // entire note. Re-downloading every `body` on a timer is what blew the
    // egress cap.
    const { data: manifest, error } = await supabase
      .from(TABLES.notes)
      .select('id, updated_at')
      .order('updated_at', { ascending: false });
    if (error || !manifest) throw error ?? new Error('Failed to fetch notes');
    const rows = manifest as { id: string; updated_at: string }[];

    // Step 2 — download bodies only for rows we don't already hold at that
    // version. In the steady state (nothing changed) this fetches nothing.
    const localById = new Map(notesRef.current.map((n) => [n.id, n]));
    const staleIds = rows
      .filter((r) => {
        // A note with unpushed local edits is about to win the merge below
        // regardless, so downloading the server's copy is pure waste — and it
        // would happen on every poll for as long as you're typing, which is
        // exactly when polls are firing.
        if (dirtyRef.current.has(r.id)) return false;
        const local = localById.get(r.id);
        return !local || local.updatedAt !== new Date(r.updated_at).getTime();
      })
      .map((r) => r.id);

    const fetched = new Map<string, Note>();
    // `.in()` serialises every id into the request URI, and the id list is
    // longest in exactly the case that must not fail: a cold start, where
    // nothing is cached so every row is stale. Left unchunked, a large enough
    // library produces a request line the proxy rejects, reconcile throws, and
    // the cache can never warm up — permanently stuck at zero notes. Chunk it.
    const CHUNK = 100;
    for (let i = 0; i < staleIds.length; i += CHUNK) {
      const { data, error: bodyError } = await supabase
        .from(TABLES.notes)
        .select('id, owner_id, title, body, lock_type, is_shared, updated_at')
        .in('id', staleIds.slice(i, i + CHUNK));
      if (bodyError || !data) throw bodyError ?? new Error('Failed to fetch notes');
      for (const row of data as NoteRow[]) fetched.set(row.id, mapRow(row));
    }

    // Step 3 — rebuild from the manifest, so ordering and deletions still come
    // from the server. Use the freshly fetched copy where there is one, the
    // cached copy otherwise.
    const byId = new Map<string, Note>();
    for (const r of rows) {
      const next = fetched.get(r.id) ?? localById.get(r.id);
      if (next) byId.set(r.id, next);
    }
    // Local changes that haven't been uploaded yet take precedence.
    for (const id of dirtyRef.current) {
      const local = notesRef.current.find((n) => n.id === id);
      if (local) byId.set(id, local);
    }
    for (const id of deletedRef.current) byId.delete(id);

    const merged = [...byId.values()];
    setNotes(merged);
    await persistCache(merged);
  }, [user, mapRow, setNotes, persistCache]);

  // Upload everything in the pending queue. Deletes first, then owned notes via
  // upsert, then partner-owned shared notes via update. Ids are cleared from the
  // queue only after their write succeeds, so a failure just leaves them queued.
  const flushPending = useCallback(async () => {
    if (!user) return;

    const deletes = [...deletedRef.current];
    if (deletes.length) {
      const { error } = await supabase.from(TABLES.notes).delete().in('id', deletes);
      if (error) throw error;
      deletedRef.current = new Set();
    }

    const owned: Record<string, unknown>[] = [];
    const foreign: Note[] = [];
    for (const id of dirtyRef.current) {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) {
        dirtyRef.current.delete(id);
        continue;
      }
      if (n.ownerId === user.id) {
        owned.push({
          id: n.id,
          owner_id: user.id,
          title: n.title,
          body: n.body,
          lock_type: n.lockType,
          is_shared: n.isShared,
        });
      } else {
        foreign.push(n);
      }
    }

    if (owned.length) {
      const { error } = await supabase.from(TABLES.notes).upsert(owned, { onConflict: 'id' });
      if (error) throw error;
      for (const row of owned) dirtyRef.current.delete(row.id as string);
    }

    for (const n of foreign) {
      const { error } = await supabase
        .from(TABLES.notes)
        .update({ title: n.title, body: n.body, lock_type: n.lockType, is_shared: n.isShared })
        .eq('id', n.id);
      if (error) throw error;
      dirtyRef.current.delete(n.id);
    }

    await persistPending();
    refreshPendingCount();
  }, [user, persistPending, refreshPendingCount]);

  const syncNow = useCallback(async () => {
    if (!user || syncingRef.current) return;
    syncingRef.current = true;
    try {
      await flushPending();
      await reconcile();
      onlineRef.current = true;
      setIsOnline(true);
    } catch {
      onlineRef.current = false;
      setIsOnline(false);
    } finally {
      syncingRef.current = false;
    }
  }, [user, flushPending, reconcile]);

  useEffect(() => {
    syncNowRef.current = syncNow;
    reconcileRef.current = reconcile;
  }, [syncNow, reconcile]);

  // Mark a note as needing upload and persist the queue.
  const markDirty = useCallback(
    async (id: string) => {
      dirtyRef.current.add(id);
      refreshPendingCount();
      await persistPending();
    },
    [refreshPendingCount, persistPending],
  );

  // Load the local cache + pending queue for this user (instant, works offline),
  // then reconcile with the server if we're online.
  useEffect(() => {
    let active = true;
    if (!uid) {
      setNotes([]);
      dirtyRef.current = new Set();
      deletedRef.current = new Set();
      setPendingCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const cached = await loadJSON<Note[]>(`${StorageKeys.notes}.${uid}`, []);
      const queue = await loadJSON<PendingQueue>(`${StorageKeys.pending}.${uid}`, { dirty: [], deleted: [] });
      const storedSeen = await loadJSON<Record<string, number> | null>(`${StorageKeys.seen}.${uid}`, null);
      const storedPinned = await loadJSON<Record<string, true>>(`${StorageKeys.pinned}.${uid}`, {});
      if (!active) return;

      pinnedRef.current = storedPinned;
      setPinnedState(storedPinned);

      dirtyRef.current = new Set(queue.dirty);
      deletedRef.current = new Set(queue.deleted);
      refreshPendingCount();
      setNotes(cached);
      setLoading(false);

      // First run on this device: treat everything already here as read, so
      // the list doesn't light up with "updated" badges on existing notes.
      if (storedSeen) {
        seenRef.current = storedSeen;
        setSeenState(storedSeen);
      } else {
        const baseline = Object.fromEntries(cached.map((n) => [n.id, n.updatedAt]));
        seenRef.current = baseline;
        setSeenState(baseline);
        saveJSON(`${StorageKeys.seen}.${uid}`, baseline).catch(() => {});
      }

      const online = await probeOnline();
      if (!active) return;
      onlineRef.current = online;
      setIsOnline(online);
      if (online) await syncNowRef.current();
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Live updates from the server + react to connectivity changes.
  useEffect(() => {
    if (!uid) return;

    // Realtime can silently go stale (dropped socket, backgrounded app, or the
    // table simply not in the realtime publication). Two safety nets so a
    // partner's new note / edit still shows up promptly:
    //   1. Reconcile the instant we return to the foreground.
    //   2. While foregrounded, poll as a fallback.
    //
    // The interval is self-tuning. This was a flat 8s, which meant the fallback
    // ran ~10,800 times a day per device even though realtime was connected and
    // already delivering every change — it did nearly all the egress for none of
    // the benefit. Now it backs off to insurance cadence once realtime confirms
    // it's subscribed, and only stays brisk when realtime never lands.
    const POLL_MS_REALTIME_OK = 10 * 60 * 1000; // 10 min — insurance only
    const POLL_MS_NO_REALTIME = 60 * 1000; //  1 min — the poll is the sync

    // Whether realtime is actually delivering, which decides which of the two
    // cadences above applies.
    let realtimeOk = false;
    // Cleared by this effect's cleanup. The subscribe() status callback is async
    // and can fire *after* teardown — removeChannel() itself pushes a CLOSED
    // status — and that callback re-arms the poll. Without this guard every
    // sign-out or uid change leaks a live 60s reconcile interval that nothing
    // holds a handle to any more, so it can never be cleared: an egress leak in
    // the very code meant to stop one.
    let alive = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (poll || !alive) return;
      const every = realtimeOk ? POLL_MS_REALTIME_OK : POLL_MS_NO_REALTIME;
      poll = setInterval(() => reconcileRef.current().catch(() => {}), every);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    const channel = supabase
      .channel('notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.notes }, () => {
        // A remote change arrived — pull and merge (keeps local pending edits).
        reconcileRef.current().catch(() => {});
      })
      .subscribe((status) => {
        if (!alive) return;
        const ok = status === 'SUBSCRIBED';
        if (ok === realtimeOk) return;
        realtimeOk = ok;
        // Either edge is evidence of a delivery gap. postgres_changes is never
        // replayed, so anything that changed while the channel was down was not
        // delivered and never will be. Catch up immediately instead of waiting
        // out the fallback tick — on the ok=true edge we are about to stretch
        // that tick to 10 minutes at the exact moment we have proof something
        // was missed.
        reconcileRef.current().catch(() => {});
        // Re-arm at the interval that now applies.
        if (AppState.currentState === 'active') {
          stopPolling();
          startPolling();
        }
      });

    const subscription = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      const wasOnline = onlineRef.current;
      onlineRef.current = online;
      setIsOnline(online);
      // Just regained connectivity — push whatever's queued and refresh.
      if (online && !wasOnline) syncNowRef.current();
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        syncNowRef.current();
        startPolling();
      } else {
        stopPolling();
      }
    });
    if (AppState.currentState === 'active') startPolling();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
      subscription.remove();
      appStateSub.remove();
      stopPolling();
    };
  }, [uid]);

  // Linking a partner writes only to the profiles table, so the notes realtime
  // channel sees nothing, and both effects above are keyed on [uid] alone — so
  // neither re-runs. The flat 8s poll used to paper over this; now that the poll
  // backs off to 10 minutes, the partner's already-existing shared notes would
  // sit invisible for that long after linking, which reads as "sharing is
  // broken". Costs one extra manifest fetch on launches where a partner is
  // already linked, which is ids-and-timestamps only.
  useEffect(() => {
    if (!uid || !partnerId) return;
    syncNowRef.current();
  }, [uid, partnerId]);

  const getNote = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  const createNote = useCallback(async (): Promise<Note | null> => {
    if (!user) return null;
    // Client-generated id (the schema's `id` column accepts it) so creation
    // works with no connection. It syncs on the next flush.
    const note: Note = {
      id: randomUUID(),
      title: '',
      body: '',
      lockType: 'none',
      isShared: false,
      ownerId: user.id,
      ownerName: user.name,
      updatedAt: Date.now(),
    };
    const next = [note, ...notesRef.current];
    setNotes(next);
    await persistCache(next);
    touchSeen(note.id, note.updatedAt);
    await markDirty(note.id);
    void syncNow();
    return note;
  }, [user, setNotes, persistCache, markDirty, syncNow, touchSeen]);

  const updateNote = useCallback<NotesContextValue['updateNote']>(
    async (id, patch) => {
      const ts = Date.now();
      const next = notesRef.current.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: ts } : n));
      setNotes(next);
      await persistCache(next);
      touchSeen(id, ts);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow, touchSeen],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const next = notesRef.current.filter((n) => n.id !== id);
      setNotes(next);
      await persistCache(next);
      dirtyRef.current.delete(id);
      deletedRef.current.add(id);
      refreshPendingCount();
      await persistPending();
      void syncNow();
    },
    [setNotes, persistCache, refreshPendingCount, persistPending, syncNow],
  );

  const toggleShared = useCallback(
    async (id: string) => {
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;
      const now = Date.now();
      const next = notesRef.current.map((n) =>
        n.id === id ? { ...n, isShared: !current.isShared, updatedAt: now } : n,
      );
      setNotes(next);
      await persistCache(next);
      touchSeen(id, now);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow, touchSeen],
  );

  const setLock = useCallback<NotesContextValue['setLock']>(
    async (id, lockType) => {
      const ts = Date.now();
      const next = notesRef.current.map((n) => (n.id === id ? { ...n, lockType, updatedAt: ts } : n));
      setNotes(next);
      await persistCache(next);
      touchSeen(id, ts);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow, touchSeen],
  );

  const myNotes = useMemo(
    () => notes.filter((n) => n.ownerId === user?.id).sort(byRecent),
    [notes, user],
  );
  const sharedNotes = useMemo(() => notes.filter((n) => n.isShared).sort(byRecent), [notes]);

  // Only the partner's changes should badge the tab — a note you edited
  // yourself is marked seen as you type (see `touchSeen`).
  const unseenSharedCount = useMemo(
    () => sharedNotes.filter((n) => n.ownerId !== uid && isUnseen(n)).length,
    [sharedNotes, uid, isUnseen],
  );

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      myNotes,
      sharedNotes,
      loading,
      isOnline,
      pendingCount,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      toggleShared,
      setLock,
      syncNow,
      isUnseen,
      markSeen,
      isPinned,
      togglePinned,
      unseenSharedCount,
    }),
    [
      notes,
      myNotes,
      sharedNotes,
      loading,
      isOnline,
      pendingCount,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      toggleShared,
      setLock,
      syncNow,
      isUnseen,
      markSeen,
      isPinned,
      togglePinned,
      unseenSharedCount,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

function byRecent(a: Note, b: Note): number {
  return b.updatedAt - a.updatedAt;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a <NotesProvider>.');
  return ctx;
}
