import { useCallback, useState } from 'react';
import { type CliError, type StatusReport, status as fetchStatus, toCliError } from '../lib/api';

/**
 * Encapsulates the check-status flow: queries the CLI for the current
 * drift state between the catalog and the project's lockfile.
 *
 * Exposes `check()` (imperative — user-initiated from the SetupForm
 * button) and `dismiss()` (clears report + error from the UI). The
 * `setReport` escape hatch lets the install flow refresh the report
 * silently after a successful install without tripping the error
 * state if the status call itself fails — this is best-effort, matching
 * the previous behavior in App.tsx. Sub-phase 5 (`useInstallFlow`) will
 * collapse this into a clean `onSuccess: () => check()` callback and
 * the setter will then be dropped from the hook's surface.
 *
 * Behavior preserved verbatim from the previous inline state +
 * handleCheckStatus + dismissStatus in App.tsx.
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
  dismiss: () => void;
  setReport: (report: StatusReport | null) => void;
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

  const dismiss = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  return { report, error, checking, check, dismiss, setReport };
};
