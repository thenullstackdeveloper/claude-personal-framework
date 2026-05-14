import { Check, Minus, Plus, RotateCw, X } from 'lucide-react';
import type { StatusArtifact, StatusReport, StatusUpdate } from '../lib/api';

type StatusViewProps = {
  readonly report: StatusReport;
  readonly onDismiss: () => void;
};

export function StatusView({ report, onDismiss }: StatusViewProps) {
  const totalDrift = report.added.length + report.updated.length + report.removed.length;
  const inSync = totalDrift === 0;

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Status: {report.presetName}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {report.hasLockfile
              ? inSync
                ? 'Installed state matches the catalog.'
                : `${totalDrift} pending change${totalDrift === 1 ? '' : 's'}.`
              : 'No lockfile yet — install would create one.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss status"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {inSync && report.unchanged.length === 0 && (
        <p className="text-sm text-zinc-500 italic">No artifacts in the resolved preset.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Bucket
          icon={<Plus className="w-3.5 h-3.5 text-emerald-400" />}
          title="Added"
          tone="emerald"
          items={report.added}
        />
        <Bucket
          icon={<RotateCw className="w-3.5 h-3.5 text-amber-400" />}
          title="Updated"
          tone="amber"
          items={report.updated}
        />
        <Bucket
          icon={<Minus className="w-3.5 h-3.5 text-red-400" />}
          title="Removed"
          tone="red"
          items={report.removed}
        />
        <Bucket
          icon={<Check className="w-3.5 h-3.5 text-zinc-500" />}
          title="Unchanged"
          tone="zinc"
          items={report.unchanged}
        />
      </div>
    </section>
  );
}

type Tone = 'emerald' | 'amber' | 'red' | 'zinc';

type BucketProps = {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly tone: Tone;
  readonly items: readonly (StatusArtifact | StatusUpdate)[];
};

function Bucket({ icon, title, tone, items }: BucketProps) {
  const headerColor: Record<Tone, string> = {
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
    zinc: 'text-zinc-400',
  };

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded p-3 space-y-2">
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${headerColor[tone]}`}>
        {icon}
        <span>
          {title} ({items.length})
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-700">—</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`} className="font-mono text-zinc-300">
              <span className="text-zinc-600">{item.type}:</span> {item.id}
              {'oldSha' in item && (
                <span className="block text-zinc-700 ml-3">
                  {item.oldSha.slice(0, 7)} → {item.newSha.slice(0, 7)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
