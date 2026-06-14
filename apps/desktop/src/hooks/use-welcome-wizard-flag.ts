import { useCallback } from 'react';
import { usePersistedState } from '../lib/persisted-state';

const STORAGE_KEY = 'cfw.welcomeWizardCompleted';

/**
 * Flag that gates the welcome wizard (CLAUDEPERS-19 / C9). When false
 * AND there's no active project, App.tsx shows the wizard instead of
 * the recent-projects screen. The wizard sets it to true on a complete
 * successful setup; the Settings panel exposes a "Restart welcome
 * wizard" button that puts it back to false so the user can re-enter
 * the guided flow on demand.
 *
 * The wizard itself doesn't ship until C8. This hook is plumbed in
 * advance so B7's Settings button has something to write to.
 */
export const useWelcomeWizardFlag = (): {
  readonly completed: boolean;
  markCompleted: () => void;
  reset: () => void;
} => {
  const [completed, setCompleted] = usePersistedState<boolean>(STORAGE_KEY, false);
  const markCompleted = useCallback(() => setCompleted(true), [setCompleted]);
  const reset = useCallback(() => setCompleted(false), [setCompleted]);
  return { completed, markCompleted, reset };
};
