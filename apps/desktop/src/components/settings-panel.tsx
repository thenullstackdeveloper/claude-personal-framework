import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, FolderPlus, Package, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { useUserCatalogFolders } from '../hooks/use-user-catalog-folders';
import { cn } from '../lib/utils';

type SettingsPanelProps = {
  readonly userFolders: ReturnType<typeof useUserCatalogFolders>;
  readonly useBuiltin: boolean;
  readonly setUseBuiltin: (value: boolean) => void;
  readonly envOverridePath: string | null;
  readonly onRestartWizard: () => void;
  readonly onClose: () => void;
};

/**
 * Full-screen modal Settings panel (decision D2). Two sections:
 *
 * 1. Catalog folders
 *    - The embedded built-in catalog with a toggle to opt out.
 *    - User-provided folders (added via Tauri folder picker, validated
 *      by useUserCatalogFolders.add()), each with a remove button.
 *    - An info row if CFW_CATALOG_PATH is set in the environment.
 *
 * 2. Welcome wizard
 *    - A button to reset the cfw.welcomeWizardCompleted flag so the
 *      wizard reappears the next time the app has no active project.
 *
 * Closes on Escape and on backdrop click.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const { userFolders, useBuiltin, setUseBuiltin, envOverridePath, onRestartWizard, onClose } =
    props;
  const [addingFolder, setAddingFolder] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleAddFolder = async (): Promise<void> => {
    setAddError(null);
    let selected: string | null = null;
    try {
      const result = await openDialog({ directory: true, multiple: false });
      selected = typeof result === 'string' ? result : null;
    } catch {
      setAddError('Could not open the folder picker.');
      return;
    }
    if (selected === null) return;
    setAddingFolder(true);
    const outcome = await userFolders.add(selected);
    setAddingFolder(false);
    if (!outcome.ok) setAddError(outcome.reason);
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-20 m-0 w-full h-full max-w-full max-h-full bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-6"
      onMouseDown={(event) => {
        // Backdrop click closes; clicks inside the content shouldn't bubble.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <header className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Catalog folders
            </h3>

            <div className="space-y-2">
              <SourceRow
                title="Built-in (embedded)"
                subtitle="Ships with the app and updates with every release."
                icon={<Package className="w-4 h-4 text-emerald-400" />}
                rightSlot={
                  <ToggleSwitch
                    checked={useBuiltin}
                    onChange={setUseBuiltin}
                    ariaLabel="Use built-in catalog"
                  />
                }
              />

              {userFolders.folders.map((path) => (
                <SourceRow
                  key={path}
                  title={pathBasename(path)}
                  subtitle={path}
                  icon={<FolderPlus className="w-4 h-4 text-violet-400" />}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => userFolders.remove(path)}
                      aria-label={`Remove ${path}`}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddFolder}
              disabled={addingFolder}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors',
                addingFolder && 'opacity-50 cursor-not-allowed',
              )}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              {addingFolder ? 'Validating…' : 'Add folder…'}
            </button>

            {addError && (
              <p
                role="alert"
                className="flex items-start gap-2 text-xs text-red-300 bg-red-950/50 border border-red-900/50 rounded p-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{addError}</span>
              </p>
            )}

            {envOverridePath !== null && (
              <p className="text-[11px] text-zinc-500 italic">
                Override: <span className="font-mono text-zinc-400">CFW_CATALOG_PATH</span> (env,
                dev only) is set to{' '}
                <span className="font-mono text-zinc-400">{envOverridePath}</span> and takes
                precedence over both user folders and the built-in.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Welcome wizard
            </h3>
            <p className="text-xs text-zinc-500">
              Show the welcome wizard again on the next launch with no active project.
            </p>
            <button
              type="button"
              onClick={onRestartWizard}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart welcome wizard
            </button>
          </section>
        </div>
      </div>
    </dialog>
  );
}

type SourceRowProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: React.ReactNode;
  readonly rightSlot: React.ReactNode;
};

function SourceRow({ title, subtitle, icon, rightSlot }: SourceRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 truncate">{title}</div>
        <div className="text-[11px] font-mono text-zinc-500 truncate">{subtitle}</div>
      </div>
      <div className="shrink-0">{rightSlot}</div>
    </div>
  );
}

type ToggleSwitchProps = {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly ariaLabel: string;
};

function ToggleSwitch({ checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex w-9 h-5 rounded-full transition-colors',
        checked ? 'bg-violet-600' : 'bg-zinc-700',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

const pathBasename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
};
