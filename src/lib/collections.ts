/**
 * Note collections — the folder-style grouping on the Notes tab.
 *
 * Two are built in and always present ("Shared" and "Your notes"); the rest
 * are created by the user. Membership and the collapsed/expanded state are
 * stored PER PERSON on-device, deliberately not synced:
 *
 *  - a note shared with your partner may belong in different places for each
 *    of you, and neither of you should be reorganising the other's list;
 *  - it needs no schema change or RLS work, so it can't break syncing.
 *
 * Notes never live in more than one custom collection; assigning to a new one
 * removes the previous assignment. Anything unassigned falls back to a
 * built-in group, so a note can never become invisible by being filed away.
 */

import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

export const BUILT_IN = {
  shared: 'shared',
  mine: 'mine',
} as const;

export type BuiltInId = (typeof BUILT_IN)[keyof typeof BUILT_IN];

export interface Collection {
  id: string;
  name: string;
}

export interface CollectionState {
  /** User-created collections, in display order. */
  collections: Collection[];
  /** noteId -> collection id. Only custom collections appear here. */
  assignments: Record<string, string>;
  /** Collection ids (built-in or custom) the user has collapsed. */
  collapsed: string[];
}

export const EMPTY_STATE: CollectionState = { collections: [], assignments: {}, collapsed: [] };

const KEY = StorageKeys.collections;

export function collectionsKey(uid: string): string {
  return `${KEY}.${uid}`;
}

export async function loadCollections(uid: string): Promise<CollectionState> {
  const raw = await loadJSON<Partial<CollectionState>>(collectionsKey(uid), EMPTY_STATE);
  // Defensive: this is user-editable persisted state that outlives app
  // versions, so never assume the shape survived.
  return {
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    assignments: raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {},
    collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : [],
  };
}

export async function saveCollections(uid: string, state: CollectionState): Promise<void> {
  await saveJSON(collectionsKey(uid), state);
}
