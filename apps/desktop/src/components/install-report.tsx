import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { CliError, InstallReport as InstallReportData } from '../lib/api';

type InstallReportProps = {
  readonly status: 'success' | 'error';
  readonly data?: InstallReportData;
  readonly error?: CliError;
  readonly onDismiss: () => void;
  readonly onRetry?: () => void;
};

export function InstallReport({ status, data, error, onDismiss, onRetry }: InstallReportProps) {
  if (status === 'error' && error?.code === 'UNMANAGED_CLAUDE_MD') {
    return (
      <section className="bg-amber-950/40 border border-amber-900 rounded-lg p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 min-w-0">
          <h3 className="text-sm font-semibold text-amber-200">
            Project has an unmanaged CLAUDE.md
          </h3>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            The project already has a <span className="font-mono">.claude/CLAUDE.md</span> the
            framework didn't create. Install refuses to overwrite it so your file stays intact. Move
            or delete it manually, then retry.
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-amber-200 hover:text-amber-50 font-semibold"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-amber-300/70 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  if (status === 'error' && error?.code === 'UNMANAGED_GIT_HOOK') {
    const hookName = error.hookName ?? '<unknown>';
    return (
      <section className="bg-amber-950/40 border border-amber-900 rounded-lg p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 min-w-0">
          <h3 className="text-sm font-semibold text-amber-200">
            Project has an unmanaged git hook
          </h3>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            The project already has a <span className="font-mono">.githooks/{hookName}</span> the
            framework didn't create. Install refuses to overwrite it so your hook stays intact. Move
            or delete it manually, then retry.
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-amber-200 hover:text-amber-50 font-semibold"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-amber-300/70 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 flex gap-3 items-start">
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 min-w-0">
          <h3 className="text-sm font-semibold text-red-200">Install failed</h3>
          <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-words font-mono">
            {error?.message ?? 'Unknown error'}
          </pre>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-red-300 hover:text-red-100"
        >
          Dismiss
        </button>
      </section>
    );
  }

  if (!data) return null;

  const claudeCount = data.agents.length + data.skills.length + data.commands.length;
  const hooksCount = data.gitHooks.length;
  const wroteSingletons = data.settings || data.instructions;
  const writtenNothing = claudeCount === 0 && hooksCount === 0 && !wroteSingletons;

  const headerSummary = (() => {
    if (writtenNothing) return 'No artifacts to install.';
    const parts: string[] = [];
    if (claudeCount > 0) {
      const noun = claudeCount === 1 ? 'artifact' : 'artifacts';
      parts.push(`${claudeCount} ${noun} written to .claude/`);
    }
    if (hooksCount > 0) {
      const noun = hooksCount === 1 ? 'hook' : 'hooks';
      const verb = parts.length === 0 ? 'written ' : '';
      parts.push(`${hooksCount} git ${noun} ${verb}to .githooks/`);
    }
    if (parts.length === 0) return 'Configuration written.';
    return parts.join(', ');
  })();

  return (
    <section className="bg-emerald-950/40 border border-emerald-900 rounded-lg p-4 flex gap-3 items-start">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 min-w-0">
        <h3 className="text-sm font-semibold text-emerald-200">
          Installed preset "{data.presetName}"
        </h3>
        <p className="text-xs text-emerald-300/80">{headerSummary}</p>
        <ul className="text-xs text-emerald-300/70 mt-2 space-y-0.5">
          {data.agents.length > 0 && (
            <li>
              Agents: <span className="font-mono">{data.agents.join(', ')}</span>
            </li>
          )}
          {data.skills.length > 0 && (
            <li>
              Skills: <span className="font-mono">{data.skills.join(', ')}</span>
            </li>
          )}
          {data.commands.length > 0 && (
            <li>
              Commands: <span className="font-mono">{data.commands.join(', ')}</span>
            </li>
          )}
          {data.gitHooks.length > 0 && (
            <li>
              Git hooks: <span className="font-mono">{data.gitHooks.join(', ')}</span>
            </li>
          )}
          {data.settings && (
            <li>
              Settings: <span className="font-mono">.claude/settings.json</span>
            </li>
          )}
          {data.instructions && (
            <li>
              Instructions: <span className="font-mono">.claude/CLAUDE.md</span>
            </li>
          )}
          {data.gitHooks.length > 0 && data.gitConfigActivated && (
            <li>
              Git config: <span className="font-mono">core.hooksPath = .githooks</span>{' '}
              <span className="text-emerald-400/60">(set by install)</span>
            </li>
          )}
          {data.gitHooks.length > 0 &&
            !data.gitConfigActivated &&
            data.gitConfigCurrent !== null && (
              <li>
                Git config:{' '}
                <span className="font-mono">core.hooksPath = {data.gitConfigCurrent}</span>{' '}
                <span className="text-emerald-400/60">(left as is — already set)</span>
              </li>
            )}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-emerald-300 hover:text-emerald-100"
      >
        Dismiss
      </button>
    </section>
  );
}
