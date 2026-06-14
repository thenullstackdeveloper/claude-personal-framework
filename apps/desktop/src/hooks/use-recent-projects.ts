import { useCallback } from 'react';
import { usePersistedState } from '../lib/persisted-state';

const STORAGE_KEY = 'cfw.recentProjects';
const MAX_ENTRIES = 5;

export type RecentProject = {
  readonly path: string;
  readonly presetName: string;
  /** ISO 8601 timestamp of the most recent successful operation on this project. */
  readonly lastUsed: string;
};

/**
 * Tracks up to {@link MAX_ENTRIES} recently used projects for the empty-state
 * screen (CLAUDEPERS-21) and the Switch dropdown (B5). Entries persist across
 * sessions in localStorage and are returned in recency order — first entry is
 * the most recent.
 *
 * `add()` is meant to be called only after a successful operation on a
 * project (init or install, decision D6). When a project is added that
 * already exists in the list, the previous entry is replaced with the new
 * one (updated presetName + lastUsed) and moved to the front. When the list
 * is at capacity, the oldest entry is evicted to make room.
 */
export const useRecentProjects = (): {
  readonly recent: readonly RecentProject[];
  add: (project: { readonly path: string; readonly presetName: string }) => void;
  remove: (path: string) => void;
  clear: () => void;
} => {
  const [recent, setRecent] = usePersistedState<readonly RecentProject[]>(STORAGE_KEY, []);

  const add = useCallback(
    (project: { readonly path: string; readonly presetName: string }) => {
      const entry: RecentProject = {
        path: project.path,
        presetName: project.presetName,
        lastUsed: new Date().toISOString(),
      };
      // Drop any existing entry for this path, prepend the new one, cap the list.
      const next = [entry, ...recent.filter((r) => r.path !== project.path)].slice(0, MAX_ENTRIES);
      setRecent(next);
    },
    [recent, setRecent],
  );

  const remove = useCallback(
    (path: string) => {
      setRecent(recent.filter((r) => r.path !== path));
    },
    [recent, setRecent],
  );

  const clear = useCallback(() => {
    setRecent([]);
  }, [setRecent]);

  return { recent, add, remove, clear };
};
