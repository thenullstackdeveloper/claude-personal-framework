import { CheckCircle2, XCircle } from 'lucide-react';
import type { CliError } from '../lib/api';

type GitignoreStatus = 'unchanged' | 'created' | 'updated' | 'block-conflict';

type InitReportProps = {
  readonly status: 'success' | 'error';
  readonly data?: {
    presetName: string;
    manifestPath: string;
    gitignore?: { status: GitignoreStatus; path: string } | null;
  };
  readonly error?: CliError;
  readonly onDismiss: () => void;
};

export function InitReport({ status, data, error, onDismiss }: InitReportProps) {
  if (status === 'error') {
    return (
      <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 flex gap-3 items-start">
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 min-w-0">
          <h3 className="text-sm font-semibold text-red-200">Initialize failed</h3>
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

  const gitignore = data.gitignore;

  return (
    <section className="bg-emerald-950/40 border border-emerald-900 rounded-lg p-4 flex gap-3 items-start">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 min-w-0">
        <h3 className="text-sm font-semibold text-emerald-200">Project initialized</h3>
        <p className="text-xs text-emerald-300/80">
          Preset <span className="font-mono">{data.presetName}</span>, manifest at{' '}
          <span className="font-mono">{data.manifestPath}</span>. You can install now.
        </p>
        {gitignore?.status === 'created' && (
          <p className="text-xs text-emerald-300/70">
            Gitignore <span className="font-mono">.gitignore</span> created with the managed block.
          </p>
        )}
        {gitignore?.status === 'updated' && (
          <p className="text-xs text-emerald-300/70">
            Gitignore <span className="font-mono">.gitignore</span> updated to cover install output.
          </p>
        )}
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
