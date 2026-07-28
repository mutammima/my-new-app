/**
 * Keeps private note content out of the iOS app-switcher snapshot.
 *
 * WHY THIS IS NATIVE, AND NOT A REACT COMPONENT
 * ---------------------------------------------
 * Two earlier attempts covered the screen from JS: an <AppLockGate> that
 * rendered a <Modal> when AppState went non-'active', and a per-note re-lock
 * that swapped the editor for a lock gate. Both still leaked, because the
 * whole approach is a race that JS cannot be relied on to win:
 * `AppState` 'inactive' originates from `UIApplicationWillResignActive`, is
 * delivered to the JS thread asynchronously, then needs a React render + a
 * commit that is dispatched *back* to the main queue — all before iOS grabs
 * the snapshot. Native `willResignActive` observers run synchronously in that
 * same main-thread moment, so they are always in time.
 *
 * TWO LAYERS, BECAUSE ONE ISN'T ENOUGH HERE
 * -----------------------------------------
 * 1. `enableAppSwitcherProtectionAsync` — expo-screen-capture's native blur,
 *    installed on `willResignActive`. This is the general cover.
 *
 *    Caveat this module exists to work around: it adds its blur to
 *    `keyWindow.subviews.first`, i.e. the ROOT view. `note/[id]` is declared
 *    `presentation: 'modal'` (src/app/_layout.tsx), which react-native-screens
 *    implements as a real `presentViewController:` — so the note's view is a
 *    *sibling above* the root view, and the blur would slide underneath it.
 *    The open note is exactly the screen we most need covered, so the blur
 *    alone does not close the reported leak.
 *
 * 2. `preventScreenCaptureAsync` — used only while a locked note is actually
 *    open. Its iOS implementation re-parents the entire key window's layer
 *    into a secure `UITextField`'s layer, so it covers the whole window
 *    including a presented sheet, and it is persistent state rather than a
 *    reaction to backgrounding (no race at all).
 *
 *    This also suppresses screenshots — deliberate and correct for a note the
 *    user has explicitly locked, and deliberately NOT applied app-wide, so
 *    ordinary screens can still be screenshotted normally.
 */

import * as ScreenCapture from 'expo-screen-capture';

/** Tag so our capture block can't be cleared by an unrelated caller. */
const LOCKED_NOTE_TAG = 'duonotes-locked-note';

let switcherProtectionOn = false;

/**
 * Install the native app-switcher blur. Safe to call repeatedly; call once at
 * app start. iOS-only in the underlying module — on Android the equivalent
 * (FLAG_SECURE) comes from `preventScreenCaptureAsync` instead, which we apply
 * per-locked-note below.
 */
export async function enableAppSwitcherPrivacy(): Promise<void> {
  if (switcherProtectionOn) return;
  try {
    // 1.0 = fully opaque blur. The default 0.5 leaves content legible, which
    // defeats the point when the whole goal is that nothing can be read.
    await ScreenCapture.enableAppSwitcherProtectionAsync(1);
    switcherProtectionOn = true;
  } catch {
    // Older binary without the native module (e.g. a JS-only reload against a
    // stale build) — nothing to do but continue unprotected.
  }
}

/**
 * Called with `true` while a locked note is on screen and unlocked, `false`
 * as soon as it is closed or re-locked.
 */
export async function setLockedNotePrivacy(active: boolean): Promise<void> {
  try {
    if (active) {
      await ScreenCapture.preventScreenCaptureAsync(LOCKED_NOTE_TAG);
    } else {
      await ScreenCapture.allowScreenCaptureAsync(LOCKED_NOTE_TAG);
    }
  } catch {
    // Same as above: never let a privacy hardening failure crash the editor.
  }
}
