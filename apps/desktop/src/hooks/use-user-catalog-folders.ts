import { useCallback } from 'react';
import { type CliError, listCatalog, toCliError } from '../lib/api';
import { usePersistedState } from '../lib/persisted-state';

const STORAGE_KEY = 'cfw.catalogFolders';

export type AddFolderResult =
  | { readonly ok: true; readonly presetCount: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Manages the user-provided catalog source folders for the Settings panel
 * (CLAUDEPERS-22 / B7). Folders persist across sessions in localStorage and
 * are exposed by `list()` in the order they were added — that order is also
 * the precedence order: the top entry wins on collisions.
 *
 * Validation on add() invokes `list_catalog` against the candidate folder
 * via Tauri, confirming the engine can read at least one preset from it.
 * The validation absorbs the original CLAUDEPERS-29 acceptance criterion
 * (sanity-check before persisting). When `--no-builtin` is implicit
 * (validation passes an empty `frameworkRoot` and the Rust side prepends
 * the built-in), the candidate's own presets are guaranteed to appear in
 * the response — a non-empty result is the green light.
 */
export const useUserCatalogFolders = (): {
  readonly folders: readonly string[];
  add: (path: string) => Promise<AddFolderResult>;
  remove: (path: string) => void;
  clear: () => void;
} => {
  const [folders, setFolders] = usePersistedState<readonly string[]>(STORAGE_KEY, []);

  const add = useCallback(
    async (path: string): Promise<AddFolderResult> => {
      const trimmed = path.trim();
      if (trimmed.length === 0) {
        return { ok: false, reason: 'Path is empty.' };
      }
      if (folders.includes(trimmed)) {
        return { ok: false, reason: 'This folder is already in the list.' };
      }
      let report: Awaited<ReturnType<typeof listCatalog>>;
      try {
        // Pass the candidate as a --catalog-folder so validation looks at it
        // exclusively (modulo the always-injected built-in). frameworkRoot
        // stays empty — the legacy flag is irrelevant here.
        report = await listCatalog('', [trimmed]);
      } catch (e) {
        const error: CliError = toCliError(e);
        return {
          ok: false,
          reason: `Could not read a catalog from this folder: ${error.message}`,
        };
      }
      // The built-in is always part of the report. To answer "does this
      // folder contribute presets?" we compare against a built-in-only
      // listing. If the count grows, the folder added something.
      let builtinReport: Awaited<ReturnType<typeof listCatalog>>;
      try {
        builtinReport = await listCatalog('', []);
      } catch {
        // If the built-in listing fails, fall back to "anything counted is
        // a win" — better permissive validation than blocking the user.
        if (report.presets.length === 0) {
          return {
            ok: false,
            reason:
              "This folder does not look like a Claude Framework catalog. Expected a 'presets/' subdirectory with at least one preset YAML.",
          };
        }
        setFolders([...folders, trimmed]);
        return { ok: true, presetCount: report.presets.length };
      }
      const contributed = report.presets.length - builtinReport.presets.length;
      if (contributed <= 0) {
        return {
          ok: false,
          reason:
            "This folder does not look like a Claude Framework catalog. Expected a 'presets/' subdirectory with at least one preset YAML.",
        };
      }
      setFolders([...folders, trimmed]);
      return { ok: true, presetCount: contributed };
    },
    [folders, setFolders],
  );

  const remove = useCallback(
    (path: string) => {
      setFolders(folders.filter((f) => f !== path));
    },
    [folders, setFolders],
  );

  const clear = useCallback(() => {
    setFolders([]);
  }, [setFolders]);

  return { folders, add, remove, clear };
};
