/**
 * The user-facing update log, shown in Settings → What's New.
 *
 * Written for BOTH people using the app, not for developers. Describe what
 * changed from the point of view of someone using DuoNotes; keep file names,
 * commit hashes and internals out of it. "Shared notes now appear right away",
 * not "added an effect keyed on partnerId".
 *
 * ADDING AN ENTRY
 *   - Newest goes at the TOP; the screen renders this array in order.
 *   - `date` is the day it shipped, as YYYY-MM-DD so it sorts and formats
 *     predictably regardless of locale.
 *   - Set `version` only when app.json's version actually changed. Most entries
 *     ship over the air under the same version and should leave it off.
 *   - `added` is for things that did not exist before; `fixed` is for things
 *     that were broken. Omit either key rather than passing an empty array.
 *
 * WHY THIS IS HAND-WRITTEN, not generated from git or from EAS update messages:
 * commit subjects are developer notes ("fix: close four holes in the
 * incremental-sync rewrite") and would have to be rewritten for a reader
 * anyway. Generating from EAS would also need a network call, which this screen
 * must work without — the log is most useful exactly when someone is wondering
 * why the app behaves differently, and that is not a moment to depend on
 * connectivity.
 */
export type ChangelogEntry = {
  /** YYYY-MM-DD, the day it shipped. */
  date: string;
  /** Only when app.json's version changed. */
  version?: string;
  /** Things that did not exist before. */
  added?: string[];
  /** Things that were broken. */
  fixed?: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-08',
    fixed: [
      'Keeping notes in sync now uses far less data. The app had been re-downloading every note every few seconds, even when nothing had changed.',
      'After you link with your partner, notes they share appear right away instead of taking up to ten minutes.',
      'A note you are actively typing in is no longer re-downloaded and overwritten mid-edit.',
      'Fixed shared notes going quiet after the connection dropped and came back, where new changes could stay hidden for several minutes.',
    ],
  },
  {
    date: '2026-07-30',
    fixed: [
      'The formatting bar now sits flush with the bottom of the screen — no more strip of note text showing underneath it.',
    ],
  },
  {
    date: '2026-07-28',
    added: [
      'Collections: group notes into folders you create, alongside the built-in Shared and personal sections.',
      'Pick any accent colour you like with the hue wheel, instead of choosing between four presets.',
      'Swipe a note in the list to pin it to the top or delete it.',
      'See when your partner has a shared note open.',
      'A dot on the Shared tab when your partner has posted something new.',
      'Light and dark themes now fade into each other instead of snapping.',
    ],
    fixed: [
      'A locked note is now hidden in the app switcher, so its contents cannot be read from the multitasking view.',
      'Unlocking a locked note no longer re-locks itself while you scroll, which could leave the note impossible to open.',
      'The whole note stays visible while the keyboard is up, and starting a new line no longer scrolls the text off screen.',
      'The delete-note confirmation now matches the rest of the app.',
    ],
  },
  {
    date: '2026-07-23',
    added: [
      'Draw directly on a note. Sketches are stored as vectors, so they stay sharp at any size.',
    ],
    fixed: ['Fixed the note editor sometimes failing to load and showing an error instead.'],
  },
];
