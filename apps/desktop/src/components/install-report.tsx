import { CheckCircle2, XCircle } from 'lucide-react';
import type { InstallReport as InstallReportData } from '../lib/api';

type InstallReportProps = {
  readonly status: 'success' | 'error';
  readonly data?: InstallReportData;
  readonly error?: string;
  readonly onDismiss: () => void;
};

export function InstallReport({ status, data, error, onDismiss }: InstallReportProps) {
  if (status === 'error') {
    return (
      <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 flex gap-3 items-start">
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 min-w-0">
          <h3 className="text-sm font-semibold text-red-200">Install failed</h3>
          <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-words font-mono">
            {error ?? 'Unknown error'}
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

  const total = data.agents.length + data.skills.length + data.commands.length;

  return (
    <section className="bg-emerald-950/40 border border-emerald-900 rounded-lg p-4 flex gap-3 items-start">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 min-w-0">
        <h3 className="text-sm font-semibold text-emerald-200">
          Installed preset "{data.presetName}"
        </h3>
        <p className="text-xs text-emerald-300/80">
          {total === 0
            ? 'No artifacts to install.'
            : `${total} artifact${total === 1 ? '' : 's'} written to .claude/`}
        </p>
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
