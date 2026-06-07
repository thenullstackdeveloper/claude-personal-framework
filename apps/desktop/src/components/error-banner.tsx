import { XCircle } from 'lucide-react';
import type { CliError } from '../lib/api';

type ErrorBannerProps = {
  readonly title: string;
  readonly error: CliError;
  readonly onDismiss: () => void;
};

export function ErrorBanner({ title, error, onDismiss }: ErrorBannerProps) {
  return (
    <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 flex gap-3 items-start">
      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2 min-w-0">
        <h3 className="text-sm font-semibold text-red-200">{title}</h3>
        <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-words font-mono">
          {error.message}
        </pre>
      </div>
      <button type="button" onClick={onDismiss} className="text-xs text-red-300 hover:text-red-100">
        Dismiss
      </button>
    </section>
  );
}
