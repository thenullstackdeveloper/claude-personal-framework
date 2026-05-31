import type { StatusReport } from './api';

/**
 * Builds the body of the native confirmation dialog shown before an install.
 * Pure function — testable without mocks. Lives in `lib/` so the hook that
 * triggers `ask()` (useInstallFlow) can import it without coupling to the
 * dialog plugin in this file.
 *
 * Behavior preserved verbatim from the previous inline implementation in
 * App.tsx. Settings / Instructions singleton drift is intentionally NOT
 * counted here yet — extending the message to mention them would be a
 * behavior change, out of scope for the hooks extraction refactor.
 */
export const buildConfirmMessage = (
  projectRoot: string,
  statusReport: StatusReport | null,
): string => {
  if (!statusReport) {
    return `Install into ${projectRoot}?\n\nThis replaces .claude/agents, .claude/skills and .claude/commands in that folder.`;
  }
  const totalDrift =
    statusReport.added.length + statusReport.updated.length + statusReport.removed.length;
  if (totalDrift === 0) {
    return `Install into ${projectRoot}?\n\nAll artifacts already match the catalog. Running install will rewrite them with identical content.`;
  }
  const parts: string[] = [];
  if (statusReport.added.length > 0) parts.push(`+${statusReport.added.length} added`);
  if (statusReport.updated.length > 0) parts.push(`~${statusReport.updated.length} updated`);
  if (statusReport.removed.length > 0) parts.push(`-${statusReport.removed.length} removed`);
  return `Install into ${projectRoot}?\n\nPending changes: ${parts.join(', ')}.\nUnchanged artifacts (${statusReport.unchanged.length}) will be rewritten with identical content.`;
};
