import { usePersistedState } from '../lib/persisted-state';

const STORAGE_KEY = 'cfw.activeProject';

export type ActiveProject = {
  readonly path: string;
};

/**
 * Single source of truth for "which project is the UI currently working on".
 * Persists across sessions in localStorage so the app reopens on the same
 * project the user left it on.
 *
 * Foundation for CLAUDEPERS-20 (the new free-mode header) and CLAUDEPERS-23
 * (stale state on project switch). The cross-flow reset that wipes out
 * status/install/init outcomes when this changes is wired by the caller via
 * `useEffect([activeProject?.path])` — that lives in App.tsx and lands with
 * B6, not here, so the hook stays a pure state holder and the reset logic
 * stays close to the flows it touches.
 */
export const useActiveProject = (): {
  readonly activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
} => {
  const [activeProject, setActiveProject] = usePersistedState<ActiveProject | null>(
    STORAGE_KEY,
    null,
  );
  return { activeProject, setActiveProject };
};
