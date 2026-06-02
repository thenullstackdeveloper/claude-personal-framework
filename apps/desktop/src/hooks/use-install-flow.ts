import { ask } from '@tauri-apps/plugin-dialog';
import { useCallback, useState } from 'react';
import {
  type CliError,
  type InstallReport as InstallReportData,
  type StatusReport,
  install as runInstall,
  toCliError,
} from '../lib/api';
import { buildConfirmMessage } from '../lib/confirm-message';

export type InstallOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'success'; readonly data: InstallReportData }
  | { readonly status: 'error'; readonly error: CliError };

/**
 * Encapsulates the install flow end-to-end:
 *   confirm → invoke CLI → outcome (success | error | idle)
 *
 * The native confirmation dialog (`ask`) lives inside the hook because
 * the confirmation is part of the flow's contract in this app — install
 * never happens without it. The pure message builder is in
 * `lib/confirm-message`, testable without mocks.
 *
 * `onSuccess` lets the caller wire a cross-flow side-effect — typically
 * `statusFlow.checkSilently` so the status report refreshes after a
 * successful install (matching the previous best-effort behavior in
 * App.tsx, which swallowed errors on the refresh).
 *
 * Take-over errors (`code: 'UNMANAGED_CLAUDE_MD'`) flow as regular
 * `error` outcomes — the `<InstallReport>` component branches on
 * `error.code` to render the amber take-over banner instead of the
 * generic red one. No special outcome variant.
 *
 * Behavior preserved verbatim from the previous inline state +
 * handleInstall + dismissInstallOutcome in App.tsx.
 */
export const useInstallFlow = ({
  frameworkRoot,
  projectRoot,
  statusReport,
  onSuccess,
}: {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly statusReport: StatusReport | null;
  readonly onSuccess?: () => void | Promise<void>;
}): {
  outcome: InstallOutcome;
  installing: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
} => {
  const [outcome, setOutcome] = useState<InstallOutcome>({ status: 'idle' });
  const [installing, setInstalling] = useState(false);

  const install = useCallback(async (): Promise<void> => {
    const confirmMsg = buildConfirmMessage(projectRoot, statusReport);
    const confirmed = await ask(confirmMsg, {
      title: 'Confirm install',
      kind: 'warning',
      okLabel: 'Install',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setInstalling(true);
    setOutcome({ status: 'idle' });
    try {
      const data = await runInstall(frameworkRoot, projectRoot);
      setOutcome({ status: 'success', data });
      await onSuccess?.();
    } catch (e) {
      setOutcome({ status: 'error', error: toCliError(e) });
    } finally {
      setInstalling(false);
    }
  }, [frameworkRoot, projectRoot, statusReport, onSuccess]);

  const dismiss = useCallback(() => {
    setOutcome({ status: 'idle' });
  }, []);

  return { outcome, installing, install, dismiss };
};
