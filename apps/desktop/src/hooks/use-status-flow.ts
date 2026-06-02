import { useCallback, useState } from 'react';
import { type CliError, type StatusReport, status as fetchStatus, toCliError } from '../lib/api';

/**
 * Encapsulates the check-status flow: queries the CLI for the current
 * drift state between the catalog and the project's lockfile.
 *
 * Exposes:
 * - `check()` — user-initiated (e.g. SetupForm button). Sets error
 *   and clears report on failure so the UI shows the red banner.
 * - `checkSilently()` — best-effort refresh used by cross-flow callers
 *   (typically the install flow's onSuccess). On failure leaves both
 *   report and error untouched — the previous in-App.tsx behavior was
 *   exactly this and the install banner stays the only visible outcome.
 * - `dismiss()` — clears report + error from the UI.
 *
 * Behavior preserved verbatim from the previous inline state +
 * handleCheckStatus + dismissStatus in App.tsx, including the silent
 * refresh that used to be a setReport escape hatch.
 */
export const useStatusFlow = ({
  frameworkRoot,
  projectRoot,
}: {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
}): {
  report: StatusReport | null;
  error: CliError | null;
  checking: boolean;
  check: () => Promise<void>;
  checkSilently: () => Promise<void>;
  dismiss: () => void;
} => {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [error, setError] = useState<CliError | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const data = await fetchStatus(frameworkRoot, projectRoot);
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(toCliError(e));
    } finally {
      setChecking(false);
    }
  }, [frameworkRoot, projectRoot]);

  const checkSilently = useCallback(async () => {
    try {
      const data = await fetchStatus(frameworkRoot, projectRoot);
      setReport(data);
    } catch {
      // best-effort: leave report and error untouched
    }
  }, [frameworkRoot, projectRoot]);

  const dismiss = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  return { report, error, checking, check, checkSilently, dismiss };
};
