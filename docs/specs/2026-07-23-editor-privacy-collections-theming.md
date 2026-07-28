<!-- saved by /spec on 2026-07-23; source: pasted in chat -->

## Status

Bugs (highest priority — user-reported regressions / privacy):
- [x] 1. Full note must stay visible when keyboard is propped up — DONE (caret bridge + padding; avoidIosKeyboard off)
- [x] 2. New line scrolls down way too much — DONE (prior "fix" was algebraically identical to scrollToEnd; replaced with real caret tracking)
- [x] 3. Hide screen in app switcher — DONE (native expo-screen-capture; JS covers structurally lost the snapshot race)
- [x] 7. App-lock unlock deadlock — DONE (Face ID sheet's own 'inactive' was treated as leaving the app; now keyed on 'background' + prompt mutex)

UI polish:
- [ ] 4. Delete-note prompt must match app UI (currently native Alert.alert) — pending
- [ ] 5. Swipe a note to pin-to-top or delete — pending
- [ ] 12. Bubble/badge on the bottom "Shared" tab when the partner posts an update — pending

Features:
- [ ] 6. Live viewer: partner presence — **decided: "partner is here" badge only** (no live cursor, no live text) — pending
- [ ] 8. Notes list: two collapsible sections/folders — "Shared notes" and "Your notes" — pending
- [ ] 9. Custom user-created collections — **decided: private per-person** (no new synced table) — pending
- [ ] 10. Theme: replace the 4 fixed accent colors with a controllable hue — **decided: color wheel** (tap/drag) — pending
- [ ] 11. Animate/transition the dark ⇄ light switch instead of snapping — pending

### Decisions captured from clarifying questions (2026-07-23)
- **Live viewer fidelity:** "partner is here" badge only. Explicitly NOT live cursor position and NOT full
  collaborative editing (the latter would require replacing last-write-wins sync with OT/CRDT — a multi-week
  rebuild, out of scope).
- **Collections scope:** private per-person. "Shared notes" / "Your notes" remain the two fixed top-level
  sections; custom collections are additional folders in the user's own view only.
- **Hue control:** color wheel the user taps/drags around (not a linear slider).

### Premise check vs. actual repo state (2026-07-23)
- Items 1 & 2 were *attempted* in PR #23/#24 (`dynamicHeight` + ScrollView unification, bounded
  `scrollTo` replacing `scrollToEnd`). User reports both still wrong → treat as unfixed, re-derive
  rather than assuming the prior approach was directionally right.
- Item 3 was *attempted* twice (AppLockGate re-lock on non-'active' AppState + per-note re-lock in
  `note/[id].tsx`). User reports the switcher still shows locked-note content → the existing
  `Modal`-based `LockScreen` cover is evidently not what iOS snapshots. Needs a different mechanism.
- Item 7 is a NEW bug introduced by the app-lock work in this same series.
- App Lock is currently ON in the user's build (turned on during verification of PR #24).

---

## Original spec (verbatim as pasted)

make sure the full notes shows even when the keyboard is propped up. when going to a new line, the text appears off the screen because the screen scroll down way too much so the addresses and fix it. Also make sure to hide the screen and app switcher and when swiped out. This is still not working. Make the delete note prompt match the UI. Also add a slide/swipe the note to pin to top or delete. add the live viewer similar to google doc or word how it shows where your partner is typing. also there’s a glitch where if you enable app lock, mid scrolling after unlocking a locked note it locks the note and make it unable to unlock. fix this bug. In notes, let there be two sections or options to open or collapse, similar to how folders work. Let one collection be Shared notes, and the others Your notes. Or another name if better. Also, add an option to make your own collection, so I can organize notes by collection.  for the appearance the themes, instead of the four colors, let there be a hue you can control to change the color. Also, let the app slowly change from dark to light, make it a transition between the two. On the shared button on the bottom, let there be a little icon or bubble for when there’s an update by the partner.

ask me questions if needed
