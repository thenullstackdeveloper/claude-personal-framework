import { FolderOpen, FolderSearch, GitCompare, Play, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ListPreset, PathDetection } from '../lib/api';
import { cn } from '../lib/utils';

type SetupFormProps = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly onFrameworkRootChange: (value: string) => void;
  readonly onProjectRootChange: (value: string) => void;
  readonly onBrowseFramework: () => void;
  readonly onBrowseProject: () => void;
  readonly onLoadCatalog: () => void;
  readonly onCheckStatus: () => void;
  readonly onInstall: () => void;
  readonly onInitialize: (presetName: string) => void;
  readonly loadingCatalog: boolean;
  readonly checkingStatus: boolean;
  readonly installing: boolean;
  readonly initializing: boolean;
  readonly projectDetection: PathDetection | null;
  readonly presets: readonly ListPreset[];
};

export function SetupForm(props: SetupFormProps) {
  const {
    frameworkRoot,
    projectRoot,
    onFrameworkRootChange,
    onProjectRootChange,
    onBrowseFramework,
    onBrowseProject,
    onLoadCatalog,
    onCheckStatus,
    onInstall,
    onInitialize,
    loadingCatalog,
    checkingStatus,
    installing,
    initializing,
    projectDetection,
    presets,
  } = props;

  const busy = installing || loadingCatalog || checkingStatus || initializing;
  const hasFramework = frameworkRoot.trim() !== '';
  const hasProject = projectRoot.trim() !== '';
  const canLoad = !busy && hasFramework;

  // Initialize mode kicks in when the project is well-defined as "not a
  // project yet" — the detection ran and reported isProject=false.
  const needsInitialize = projectDetection !== null && projectDetection.isProject === false;
  const isProject = projectDetection !== null && projectDetection.isProject === true;

  const canInstall = !busy && hasFramework && hasProject && isProject;
  const canStatus = !busy && hasFramework && hasProject && isProject;

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Setup</h2>

      <div className="space-y-3">
        <PathField
          label="Framework root"
          hint="Pick the catalog repo — the folder that contains presets/, agents/, skills/ and commands/."
          value={frameworkRoot}
          onChange={onFrameworkRootChange}
          onBrowse={onBrowseFramework}
        />
        <PathField
          label="Project root"
          hint="Pick the target project. If it has no .claude-fw.yaml yet, you can initialize it below."
          value={projectRoot}
          onChange={onProjectRootChange}
          onBrowse={onBrowseProject}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onLoadCatalog}
          disabled={!canLoad}
          className={buttonClass('secondary', !canLoad)}
        >
          <RefreshCw className={cn('w-4 h-4', loadingCatalog && 'animate-spin')} />
          {loadingCatalog ? 'Loading…' : 'Load catalog'}
        </button>
        <button
          type="button"
          onClick={onCheckStatus}
          disabled={!canStatus}
          className={buttonClass('secondary', !canStatus)}
        >
          <GitCompare className={cn('w-4 h-4', checkingStatus && 'animate-spin')} />
          {checkingStatus ? 'Checking…' : 'Check status'}
        </button>
        <button
          type="button"
          onClick={onInstall}
          disabled={!canInstall}
          className={buttonClass('primary', !canInstall)}
        >
          <Play className="w-4 h-4" />
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>

      {needsInitialize && (
        <InitializeBlock
          presets={presets}
          initializing={initializing}
          busy={busy}
          onInitialize={onInitialize}
        />
      )}
    </section>
  );
}

type InitializeBlockProps = {
  readonly presets: readonly ListPreset[];
  readonly initializing: boolean;
  readonly busy: boolean;
  readonly onInitialize: (presetName: string) => void;
};

function InitializeBlock({ presets, initializing, busy, onInitialize }: InitializeBlockProps) {
  const [selected, setSelected] = useState<string>('');

  // Default the selection to the first preset whenever the list changes.
  useEffect(() => {
    if (presets.length > 0 && !presets.some((p) => p.name === selected)) {
      const first = presets[0];
      if (first) setSelected(first.name);
    }
    if (presets.length === 0) setSelected('');
  }, [presets, selected]);

  const hasPresets = presets.length > 0;
  const canInit = hasPresets && selected !== '' && !busy;

  return (
    <div className="border-t border-zinc-800 pt-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-zinc-200">Project not initialized</p>
          <p className="text-xs text-zinc-500">
            No <span className="font-mono">.claude-fw.yaml</span> in this folder. Pick a preset to
            create one and unlock Install.
          </p>
        </div>
      </div>

      {!hasPresets ? (
        <p className="text-xs text-zinc-500 italic">
          Click <span className="font-medium">Load catalog</span> to see the available presets.
        </p>
      ) : (
        <div className="flex gap-2 items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:border-violet-500 focus:outline-none disabled:opacity-50 [color-scheme:dark]"
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name} className="bg-zinc-950 text-zinc-100">
                {p.name}
                {p.extends.length > 0 ? ` (extends ${p.extends.join(', ')})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onInitialize(selected)}
            disabled={!canInit}
            className={buttonClass('primary', !canInit)}
          >
            <Sparkles className="w-4 h-4" />
            {initializing ? 'Initializing…' : 'Initialize'}
          </button>
        </div>
      )}
    </div>
  );
}

type PathFieldProps = {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBrowse: () => void;
};

function PathField({ label, hint, value, onChange, onBrowse }: PathFieldProps) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
        <FolderSearch className="w-3.5 h-3.5" />
        {label}
      </span>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="/path/to/folder"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-700 focus:border-violet-500 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={onBrowse}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Browse
        </button>
      </div>
      <span className="text-xs text-zinc-500 block">{hint}</span>
    </label>
  );
}

function buttonClass(variant: 'primary' | 'secondary', disabled: boolean): string {
  const base =
    'inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors';
  const disabledClass = 'opacity-50 cursor-not-allowed';
  const variantClass =
    variant === 'primary'
      ? 'bg-violet-600 hover:bg-violet-500 text-white'
      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700';
  return cn(base, variantClass, disabled && disabledClass);
}
