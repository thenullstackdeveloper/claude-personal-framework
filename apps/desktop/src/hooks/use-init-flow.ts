import { confirm } from '@tauri-apps/plugin-dialog';
import { useCallback, useState } from 'react';
import {
  type CliError,
  ensureGitRepo,
  ensureProjectDir,
  initialize as runInitialize,
  toCliError,
} from '../lib/api';

export type InitOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'success'; readonly presetName: string; readonly manifestPath: string }
  | { readonly status: 'error'; readonly error: CliError };

/**
 * Encapsulates the initialize-project flow: writes a `.claude-fw.yaml`
 * manifest into the project pointing at the chosen preset. Wraps the
 * outcome as a discriminated union so the consuming render can branch
 * exhaustively (idle / success / error).
 *
 * NOT_A_GIT_REPO from the engine is intercepted here: a native confirm
 * dialog asks the user whether to `git init` the folder. On confirm,
 * the hook invokes ensureGitRepo() and retries the initialize call
 * once; on cancel, the outcome stays at idle (no red banner — the user
 * decided consciously and the subsequent install will skip core.hooksPath
 * gracefully, see CLAUDEPERS-12).
 *
 * PROJECT_DIR_MISSING from the engine triggers the analogous flow with
 * a native confirm dialog offering to `mkdir -p` the folder, then a
 * retry. On cancel, outcome stays at idle. Same model as the git-init
 * prompt; see CLAUDEPERS-24.
 *
 * `onSuccess` lets the caller wire a cross-flow side-effect that fires
 * only after a successful initialize — used by App.tsx to refresh the
 * project detection (the path didn't change but a manifest now exists,
 * so the detection result does). It is intentionally NOT awaited and
 * NOT caught by the hook: the callback is the consumer's escape hatch
 * and any error it throws bubbles up.
 */
export const useInitFlow = ({
  frameworkRoot,
  projectRoot,
  catalogFolders,
  allowBuiltin,
  onSuccess,
}: {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly catalogFolders?: readonly string[];
  readonly allowBuiltin?: boolean;
  readonly onSuccess?: () => void;
}): {
  outcome: InitOutcome;
  initializing: boolean;
  initialize: (presetName: string) => Promise<void>;
  dismiss: () => void;
} => {
  const [outcome, setOutcome] = useState<InitOutcome>({ status: 'idle' });
  const [initializing, setInitializing] = useState(false);

  const initialize = useCallback(
    async (presetName: string): Promise<void> => {
      setInitializing(true);
      setOutcome({ status: 'idle' });
      try {
        const data = await runInitialize(
          frameworkRoot,
          projectRoot,
          presetName,
          catalogFolders,
          allowBuiltin,
        );
        setOutcome({
          status: 'success',
          presetName: data.presetName,
          manifestPath: data.manifestPath,
        });
        onSuccess?.();
      } catch (e) {
        const error = toCliError(e);
        if (error.code === 'PROJECT_DIR_MISSING') {
          const folder = error.projectRoot ?? projectRoot;
          const wantsMkdir = await confirm(
            `The folder at ${folder} does not exist. Create it and continue?`,
            { title: 'Create folder?', okLabel: 'Create folder', cancelLabel: 'Cancel' },
          );
          if (!wantsMkdir) {
            setOutcome({ status: 'idle' });
            return;
          }
          try {
            await ensureProjectDir(folder);
            // Recurse so the retry can also handle a downstream
            // NOT_A_GIT_REPO from the newly created folder.
            await initialize(presetName);
            return;
          } catch (retryErr) {
            setOutcome({ status: 'error', error: toCliError(retryErr) });
            return;
          }
        }
        if (error.code === 'NOT_A_GIT_REPO') {
          const folder = error.projectRoot ?? projectRoot;
          const wantsGitInit = await confirm(
            `The folder at ${folder} is not a git repository. Initialize git here so hooks can activate?`,
            { title: 'Initialize git?', okLabel: 'Initialize git', cancelLabel: 'Skip' },
          );
          if (!wantsGitInit) {
            // User declined consciously — leave outcome at idle, no banner.
            setOutcome({ status: 'idle' });
            return;
          }
          try {
            await ensureGitRepo(folder);
            const data = await runInitialize(
              frameworkRoot,
              projectRoot,
              presetName,
              catalogFolders,
              allowBuiltin,
            );
            setOutcome({
              status: 'success',
              presetName: data.presetName,
              manifestPath: data.manifestPath,
            });
            onSuccess?.();
            return;
          } catch (retryErr) {
            setOutcome({ status: 'error', error: toCliError(retryErr) });
            return;
          }
        }
        setOutcome({ status: 'error', error });
      } finally {
        setInitializing(false);
      }
    },
    [frameworkRoot, projectRoot, catalogFolders, allowBuiltin, onSuccess],
  );

  const dismiss = useCallback(() => {
    setOutcome({ status: 'idle' });
  }, []);

  return { outcome, initializing, initialize, dismiss };
};
