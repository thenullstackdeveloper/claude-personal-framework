import { FolderOpen, Plus, Settings, Sparkles, X } from 'lucide-react';
import type { RecentProject } from '../hooks/use-recent-projects';

type RecentProjectsScreenProps = {
  readonly recent: readonly RecentProject[];
  readonly onSelectRecent: (project: RecentProject) => void;
  readonly onRemoveRecent: (path: string) => void;
  readonly onBrowse: () => void;
  readonly onNewProject: () => void;
  readonly onSettings: () => void;
};

/**
 * Pantalla D del wireframe (CLAUDEPERS-21): se muestra cuando no hay
 * activeProject. Empty state cuando recent está vacío; lista de proyectos
 * recientes en otro caso. Header con botón Settings.
 */
export function RecentProjectsScreen(props: RecentProjectsScreenProps) {
  const { recent, onSelectRecent, onRemoveRecent, onBrowse, onNewProject, onSettings } = props;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Claude Framework</h1>
          <p className="text-sm text-zinc-400">Pick a project to start.</p>
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </header>

      {recent.length === 0 ? (
        <section className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg p-12 text-center space-y-4">
          <Sparkles className="w-10 h-10 text-zinc-600 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-zinc-200">No projects yet</h2>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Pick a folder to start managing its Claude Code setup. New folders are walked through
              the welcome wizard automatically.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Browse…
            </button>
            <button
              type="button"
              onClick={onNewProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h2 className="text-[11px] uppercase tracking-wide text-zinc-500">Recent projects</h2>
          <ul className="space-y-1">
            {recent.map((entry) => (
              <li key={entry.path} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectRecent(entry)}
                  className="flex-1 text-left px-3 py-2 rounded hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="text-sm text-zinc-100 truncate">{basename(entry.path)}</div>
                  <div className="text-[11px] font-mono text-zinc-500 truncate">{entry.path}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {entry.presetName} · {relativeTime(entry.lastUsed)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRecent(entry.path)}
                  aria-label={`Remove ${entry.path} from recents`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Browse…
            </button>
            <button
              type="button"
              onClick={onNewProject}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New project
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
};

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} d ago`;
  return new Date(iso).toLocaleDateString();
};
