import { useCallback, useState } from 'react';
import { type CliError, initialize as runInitialize, toCliError } from '../lib/api';

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
 * `onSuccess` lets the caller wire a cross-flow side-effect that fires
 * only after a successful initialize — used by App.tsx to refresh the
 * project detection (the path didn't change but a manifest now exists,
 * so the detection result does). It is intentionally NOT awaited and
 * NOT caught by the hook: the callback is the consumer's escape hatch
 * and any error it throws bubbles up.
 *
 * Behavior preserved verbatim from the previous inline state +
 * handleInitialize + dismissInitOutcome in App.tsx.
 */
export const useInitFlow = ({
  frameworkRoot,
  projectRoot,
  onSuccess,
}: {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
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
        const data = await runInitialize(frameworkRoot, projectRoot, presetName);
        setOutcome({
          status: 'success',
          presetName: data.presetName,
          manifestPath: data.manifestPath,
        });
        onSuccess?.();
      } catch (e) {
        setOutcome({ status: 'error', error: toCliError(e) });
      } finally {
        setInitializing(false);
      }
    },
    [frameworkRoot, projectRoot, onSuccess],
  );

  const dismiss = useCallback(() => {
    setOutcome({ status: 'idle' });
  }, []);

  return { outcome, initializing, initialize, dismiss };
};
