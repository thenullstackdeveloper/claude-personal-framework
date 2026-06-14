import { ChevronDown, FolderOpen, Plus, Settings, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActiveProject } from '../hooks/use-active-project';
import type { RecentProject } from '../hooks/use-recent-projects';
import { cn } from '../lib/utils';

type ProjectHeaderProps = {
  readonly activeProject: ActiveProject;
  readonly presetName: string | null;
  readonly recent: readonly RecentProject[];
  readonly onSelectRecent: (project: RecentProject) => void;
  readonly onBrowse: () => void;
  readonly onNewProject: () => void;
  readonly onSettings: () => void;
};

/**
 * Cabecera del modo libre (CLAUDEPERS-20). Muestra el proyecto activo con
 * su preset y expone los dos puntos de acceso laterales:
 *
 * - "▼ Switch" → SwitchProjectDropdown con Recent + Browse + New project.
 * - "⚙ Settings" → SettingsPanel (B7, no wireado todavía).
 *
 * La cabecera es siempre visible cuando hay un proyecto activo. La pantalla
 * D ("recent" sin proyecto activo) NO usa esta cabecera; vivirá aparte en B6.
 */
export function ProjectHeader(props: ProjectHeaderProps) {
  const { activeProject, presetName, recent, onSelectRecent, onBrowse, onNewProject, onSettings } =
    props;

  const projectLabel = basename(activeProject.path) || activeProject.path;

  return (
    <header className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <span className="truncate">{projectLabel}</span>
        </h1>
        <p className="text-xs font-mono text-zinc-500 truncate mt-0.5">{activeProject.path}</p>
        {presetName ? (
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-400" />
            Preset: <span className="font-medium text-zinc-200">{presetName}</span>
          </p>
        ) : (
          <p className="text-xs text-zinc-500 mt-1 italic">
            No preset yet — initialize the project
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <SwitchProjectDropdown
          recent={recent}
          onSelectRecent={onSelectRecent}
          onBrowse={onBrowse}
          onNewProject={onNewProject}
        />
        <button
          type="button"
          onClick={onSettings}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </header>
  );
}

type SwitchProjectDropdownProps = {
  readonly recent: readonly RecentProject[];
  readonly onSelectRecent: (project: RecentProject) => void;
  readonly onBrowse: () => void;
  readonly onNewProject: () => void;
};

/**
 * Custom dropdown sin librería de UI primitives (decisión D3). Trigger en
 * el header, menu absolute-posicionado debajo. Cierra:
 *  - Al hacer click en cualquier item.
 *  - Al hacer click fuera (mousedown global).
 *  - Al pulsar Escape.
 */
export function SwitchProjectDropdown(props: SwitchProjectDropdownProps) {
  const { recent, onSelectRecent, onBrowse, onNewProject } = props;
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const selectAndClose = <T,>(handler: (value: T) => void) => {
    return (value: T) => {
      handler(value);
      setIsOpen(false);
    };
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
      >
        Switch project
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-72 bg-zinc-950 border border-zinc-800 rounded-lg shadow-lg p-1 z-10"
        >
          {recent.length > 0 && (
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
              Recent
            </div>
          )}
          {recent.map((entry) => (
            <button
              key={entry.path}
              type="button"
              role="menuitem"
              onClick={() => selectAndClose(onSelectRecent)(entry)}
              className="w-full text-left px-2 py-2 rounded hover:bg-zinc-900 group"
            >
              <div className="text-sm text-zinc-100 truncate">{basename(entry.path)}</div>
              <div className="text-[11px] font-mono text-zinc-500 truncate group-hover:text-zinc-400">
                {entry.path}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {entry.presetName} · {relativeTime(entry.lastUsed)}
              </div>
            </button>
          ))}
          {recent.length > 0 && <div className="border-t border-zinc-800 my-1" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onBrowse();
            }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-zinc-900 text-sm text-zinc-100"
          >
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            Browse…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onNewProject();
            }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-zinc-900 text-sm text-zinc-100"
          >
            <Plus className="w-4 h-4 text-zinc-400" />
            New project (open wizard)
          </button>
        </div>
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
