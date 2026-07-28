/**
 * Per-person note collections (see src/lib/collections.ts for why these are
 * local rather than synced).
 */

import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import {
  type Collection,
  type CollectionState,
  EMPTY_STATE,
  loadCollections,
  saveCollections,
} from '@/lib/collections';

interface CollectionsContextValue {
  collections: Collection[];
  /** Collection id a note is filed under, or undefined if unassigned. */
  collectionOf: (noteId: string) => string | undefined;
  isCollapsed: (id: string) => boolean;
  toggleCollapsed: (id: string) => void;
  createCollection: (name: string) => string | null;
  renameCollection: (id: string, name: string) => void;
  /** Deleting a collection only unfiles its notes — it never deletes them. */
  deleteCollection: (id: string) => void;
  assign: (noteId: string, collectionId: string | null) => void;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<CollectionState>(EMPTY_STATE);
  const stateRef = useRef<CollectionState>(EMPTY_STATE);

  useEffect(() => {
    let active = true;
    // No user: nothing to load. The signed-out result is DERIVED below rather
    // than written here, so this effect never sets state just to clear it.
    if (!uid) {
      stateRef.current = EMPTY_STATE;
      return;
    }
    loadCollections(uid).then((loaded) => {
      if (!active) return;
      stateRef.current = loaded;
      setState(loaded);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  const write = useCallback(
    (next: CollectionState) => {
      stateRef.current = next;
      setState(next);
      if (uid) saveCollections(uid, next).catch(() => {});
    },
    [uid],
  );

  // Signed out shows nothing, without needing a state write to get there.
  const view = uid ? state : EMPTY_STATE;

  const collectionOf = useCallback((noteId: string) => view.assignments[noteId], [view]);
  const isCollapsed = useCallback((id: string) => view.collapsed.includes(id), [view]);

  const toggleCollapsed = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      const collapsed = cur.collapsed.includes(id)
        ? cur.collapsed.filter((c) => c !== id)
        : [...cur.collapsed, id];
      write({ ...cur, collapsed });
    },
    [write],
  );

  const createCollection = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const id = randomUUID();
      write({
        ...stateRef.current,
        collections: [...stateRef.current.collections, { id, name: trimmed }],
      });
      return id;
    },
    [write],
  );

  const renameCollection = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      write({
        ...stateRef.current,
        collections: stateRef.current.collections.map((c) =>
          c.id === id ? { ...c, name: trimmed } : c,
        ),
      });
    },
    [write],
  );

  const deleteCollection = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      // Unfile the notes rather than deleting them — a collection is just a
      // view over notes, so removing it must never destroy content.
      const assignments = Object.fromEntries(
        Object.entries(cur.assignments).filter(([, cid]) => cid !== id),
      );
      write({
        collections: cur.collections.filter((c) => c.id !== id),
        assignments,
        collapsed: cur.collapsed.filter((c) => c !== id),
      });
    },
    [write],
  );

  const assign = useCallback(
    (noteId: string, collectionId: string | null) => {
      const cur = stateRef.current;
      const assignments = { ...cur.assignments };
      if (collectionId) assignments[noteId] = collectionId;
      else delete assignments[noteId];
      write({ ...cur, assignments });
    },
    [write],
  );

  const value = useMemo(
    () => ({
      collections: view.collections,
      collectionOf,
      isCollapsed,
      toggleCollapsed,
      createCollection,
      renameCollection,
      deleteCollection,
      assign,
    }),
    [
      view.collections,
      collectionOf,
      isCollapsed,
      toggleCollapsed,
      createCollection,
      renameCollection,
      deleteCollection,
      assign,
    ],
  );

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

export function useCollections(): CollectionsContextValue {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollections must be used within a <CollectionsProvider>.');
  return ctx;
}
