import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { LockScreen } from '@/components/lock-screen';
import { useAppLock } from '@/context/app-lock-context';
import { useAuth } from '@/context/auth-context';

/**
 * Gates the signed-in app behind the lock screen when App Lock is on:
 *  - locks once on cold launch,
 *  - re-locks whenever the app leaves the foreground (which also drops the
 *    splash cover over the app-switcher snapshot — see LockScreen),
 *  - clears only when the user passes biometrics or the PIN.
 *
 * Only armed while there's a signed-in user; the signed-out auth screen has no
 * private content to protect.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { enabled } = useAppLock();
  const armed = enabled && !!user;

  const [locked, setLocked] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  // Bumped on each genuine background so the lock screen re-arms its biometric
  // auto-prompt exactly once per return — NOT on the transient 'inactive' the
  // Face ID system sheet itself causes, which would loop the prompt.
  const [promptToken, setPromptToken] = useState(0);
  const coldLockDone = useRef(false);

  // Lock once, the first time the lock becomes applicable this session (i.e.
  // cold launch after a session is restored). Toggling it on mid-session is
  // deliberately NOT an instant lock-out — that waits for the next background.
  useEffect(() => {
    if (armed && !coldLockDone.current) {
      coldLockDone.current = true;
      setLocked(true);
    }
  }, [armed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      // Re-lock on 'background' ONLY — never on 'inactive'.
      //
      // This used to fire on any non-'active' state, to try to raise the cover
      // before iOS snapshots the app switcher. That job now belongs to the
      // native privacy cover (src/lib/privacy-screen.ts), which is actually
      // fast enough to do it; JS never reliably was.
      //
      // Keeping 'inactive' here was also actively harmful: the system Face ID
      // sheet itself drives the app 'inactive', so authenticating re-locked
      // the very thing being unlocked, and the two gates then re-triggered
      // each other — the "can't unlock it at all" bug. 'background' means the
      // user genuinely left, which is exactly when re-auth should be required.
      if (next === 'background' && armed) {
        setLocked(true);
        setPromptToken((t) => t + 1);
      }
    });
    return () => sub.remove();
  }, [armed]);

  return (
    <>
      {children}
      {armed && locked && (
        <LockScreen
          foreground={foreground}
          promptToken={promptToken}
          onUnlocked={() => setLocked(false)}
        />
      )}
    </>
  );
}
