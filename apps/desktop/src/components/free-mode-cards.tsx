import {
  AlertTriangle,
  Boxes,
  GitCompare,
  Play,
  RefreshCw,
  ScrollText,
  Sparkles,
  Webhook,
} from 'lucide-react';
import type { CatalogReport, StatusReport } from '../lib/api';
import { cn } from '../lib/utils';

type CardProps = {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
};

function Card({ icon, title, children }: CardProps) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-center gap-2 text-zinc-400 text-[11px] uppercase tracking-wide">
        {icon}
        <span>{title}</span>
      </div>
      <div className="flex-1 flex flex-col gap-2">{children}</div>
    </section>
  );
}

type StatusCardProps = {
  readonly report: StatusReport | null;
  readonly checking: boolean;
  readonly hasManifest: boolean;
  readonly onCheck: () => void;
};

export function StatusCard({ report, checking, hasManifest, onCheck }: StatusCardProps) {
  return (
    <Card icon={<GitCompare className="w-4 h-4 text-violet-400" />} title="Status">
      {!hasManifest ? (
        <p className="text-xs text-zinc-500 italic flex-1">
          Project not initialized yet — no status to check.
        </p>
      ) : checking ? (
        <p className="text-xs text-zinc-400 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Checking…
        </p>
      ) : !report ? (
        <p className="text-xs text-zinc-500 italic flex-1">No status check yet.</p>
      ) : driftCount(report) === 0 ? (
        <p className="text-sm text-emerald-400 font-medium">✓ No drift</p>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-amber-400 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {driftCount(report)} change{driftCount(report) === 1 ? '' : 's'} pending
          </p>
          <p className="text-[11px] text-zinc-500">{driftBreakdown(report)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onCheck}
        disabled={!hasManifest || checking}
        className={cn(
          'inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded text-xs font-medium border transition-colors',
          'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700',
          (!hasManifest || checking) && 'opacity-50 cursor-not-allowed',
        )}
      >
        <RefreshCw className={cn('w-3 h-3', checking && 'animate-spin')} />
        {report ? 'Re-check' : 'Check now'}
      </button>
    </Card>
  );
}

const driftCount = (r: StatusReport): number =>
  r.added.length +
  r.updated.length +
  r.removed.length +
  (r.settings.kind === 'unchanged' ? 0 : 1) +
  (r.instructions.kind === 'unchanged' ? 0 : 1);

const driftBreakdown = (r: StatusReport): string => {
  const parts: string[] = [];
  if (r.added.length > 0) parts.push(`+${r.added.length} added`);
  if (r.updated.length > 0) parts.push(`~${r.updated.length} updated`);
  if (r.removed.length > 0) parts.push(`-${r.removed.length} removed`);
  if (r.settings.kind !== 'unchanged') parts.push('settings');
  if (r.instructions.kind !== 'unchanged') parts.push('instructions');
  return parts.join(', ');
};

type CatalogCardProps = {
  readonly catalog: CatalogReport | null;
  readonly loading: boolean;
  readonly onLoad: () => void;
};

export function CatalogCard({ catalog, loading, onLoad }: CatalogCardProps) {
  return (
    <Card icon={<Boxes className="w-4 h-4 text-emerald-400" />} title="Catalog">
      {loading && !catalog ? (
        <p className="text-xs text-zinc-400 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </p>
      ) : !catalog ? (
        <p className="text-xs text-zinc-500 italic flex-1">Click Load to see the catalog.</p>
      ) : (
        <div className="space-y-1 text-xs text-zinc-300">
          <CatalogLine
            icon={<Sparkles className="w-3 h-3" />}
            count={catalog.agents.length}
            label="agents"
          />
          <CatalogLine
            icon={<ScrollText className="w-3 h-3" />}
            count={catalog.skills.length}
            label="skills"
          />
          <CatalogLine
            icon={<Webhook className="w-3 h-3" />}
            count={catalog.gitHooks.length}
            label="git hooks"
          />
          <CatalogLine
            icon={<Boxes className="w-3 h-3" />}
            count={catalog.presets.length}
            label="presets"
          />
        </div>
      )}
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded text-xs font-medium border transition-colors',
          'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700',
          loading && 'opacity-50 cursor-not-allowed',
        )}
      >
        <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        {catalog ? 'Reload' : 'Load'}
      </button>
    </Card>
  );
}

function CatalogLine({
  icon,
  count,
  label,
}: {
  readonly icon: React.ReactNode;
  readonly count: number;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{icon}</span>
      <span className="font-mono text-zinc-100">{count}</span>
      <span className="text-zinc-500">{label}</span>
    </div>
  );
}

type ActionsCardProps = {
  readonly hasManifest: boolean;
  readonly installing: boolean;
  readonly initializing: boolean;
  readonly canInitialize: boolean;
  readonly onInstall: () => void;
  readonly onInitialize: () => void;
};

export function ActionsCard({
  hasManifest,
  installing,
  initializing,
  canInitialize,
  onInstall,
  onInitialize,
}: ActionsCardProps) {
  return (
    <Card icon={<Play className="w-4 h-4 text-violet-400" />} title="Actions">
      {hasManifest ? (
        <button
          type="button"
          onClick={onInstall}
          disabled={installing}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors',
            'bg-violet-600 hover:bg-violet-500 text-white',
            installing && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Play className="w-3.5 h-3.5" />
          {installing ? 'Installing…' : 'Re-install'}
        </button>
      ) : (
        <>
          <p className="text-xs text-zinc-500 italic">
            This project needs to be initialized before it can be installed.
          </p>
          <button
            type="button"
            onClick={onInitialize}
            disabled={!canInitialize || initializing}
            className={cn(
              'inline-flex items-center gap-1.5 self-start px-3 py-2 rounded text-sm font-medium transition-colors',
              'bg-violet-600 hover:bg-violet-500 text-white',
              (!canInitialize || initializing) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {initializing ? 'Initializing…' : 'Initialize'}
          </button>
        </>
      )}
    </Card>
  );
}
