import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, FolderSearch, Play, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

type SetupFormProps = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly onFrameworkRootChange: (value: string) => void;
  readonly onProjectRootChange: (value: string) => void;
  readonly onLoadCatalog: () => void;
  readonly onInstall: () => void;
  readonly loadingCatalog: boolean;
  readonly installing: boolean;
};

export function SetupForm({
  frameworkRoot,
  projectRoot,
  onFrameworkRootChange,
  onProjectRootChange,
  onLoadCatalog,
  onInstall,
  loadingCatalog,
  installing,
}: SetupFormProps) {
  const canInstall =
    !installing && !loadingCatalog && frameworkRoot.trim() !== '' && projectRoot.trim() !== '';
  const canLoad = !installing && !loadingCatalog && frameworkRoot.trim() !== '';

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Setup</h2>

      <div className="space-y-3">
        <PathField
          label="Framework root"
          hint="Path to the catalog repo (with presets/, agents/, skills/, commands/)."
          value={frameworkRoot}
          onChange={onFrameworkRootChange}
          browseTitle="Select framework root"
        />
        <PathField
          label="Project root"
          hint="Target project containing .claude-fw.yaml. Will receive .claude/ output."
          value={projectRoot}
          onChange={onProjectRootChange}
          browseTitle="Select project root"
        />
      </div>

      <div className="flex gap-2 pt-1">
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
          onClick={onInstall}
          disabled={!canInstall}
          className={buttonClass('primary', !canInstall)}
        >
          <Play className="w-4 h-4" />
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>
    </section>
  );
}

type PathFieldProps = {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly browseTitle: string;
};

function PathField({ label, hint, value, onChange, browseTitle }: PathFieldProps) {
  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: browseTitle,
      ...(value && { defaultPath: value }),
    });
    if (typeof selected === 'string') onChange(selected);
  };

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
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:border-violet-500 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={handleBrowse}
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
