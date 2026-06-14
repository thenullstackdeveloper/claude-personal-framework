import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, ArrowLeft, ArrowRight, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useInitFlow } from '../hooks/use-init-flow';
import {
  type CatalogReport,
  type CliError,
  detectStack,
  install as runInstall,
  toCliError,
} from '../lib/api';
import { cn } from '../lib/utils';

type WelcomeWizardProps = {
  readonly catalog: CatalogReport | null;
  readonly catalogError: CliError | null;
  readonly catalogFolders: readonly string[];
  readonly allowBuiltin: boolean;
  /** Called after a successful init + install. */
  readonly onComplete: (path: string, presetName: string) => void;
  /** Called when the user clicks Skip — no flag should be marked. */
  readonly onSkip: () => void;
  /** Opens the Settings panel so the user can fix a missing catalog source. */
  readonly onOpenSettings: () => void;
};

type DetectMatch = {
  readonly preset: string;
  readonly specificity: number;
};

type Phase =
  | { readonly kind: 'picking' }
  | { readonly kind: 'initializing' }
  | { readonly kind: 'installing' }
  | { readonly kind: 'failed'; readonly error: CliError; readonly stage: 'init' | 'install' };

/**
 * Welcome wizard (CLAUDEPERS-19 / C8). Two-step guided setup for the
 * first project: choose project + preset, then set up (init + install
 * sequentially). Decision F locks the count at 2 steps; decision A3
 * locks "Back preserves selection". The wizard itself does NOT mark
 * the welcomeWizardCompleted flag — App.tsx (C9) does, only after the
 * full setup lands green.
 *
 * Init uses useInitFlow so the PROJECT_DIR_MISSING and NOT_A_GIT_REPO
 * confirm modals from CLAUDEPERS-24 / CLAUDEPERS-13 are reused
 * verbatim. Install is invoked directly via api.ts to skip the
 * "Confirm install" dialog — the user already clicked "Set up
 * project", confirming is redundant.
 */
export function WelcomeWizard(props: WelcomeWizardProps) {
  const {
    catalog,
    catalogError,
    catalogFolders,
    allowBuiltin,
    onComplete,
    onSkip,
    onOpenSettings,
  } = props;

  const [step, setStep] = useState<1 | 2>(1);
  const [projectPath, setProjectPath] = useState('');
  const [presetName, setPresetName] = useState('');
  const [matches, setMatches] = useState<readonly DetectMatch[]>([]);
  const [detectError, setDetectError] = useState<CliError | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'picking' });

  const init = useInitFlow({
    frameworkRoot: '',
    projectRoot: projectPath,
    catalogFolders,
    allowBuiltin,
  });

  // When the user picks (or changes) the project path, run detect-stack.
  // The first preset of the catalog is the fallback choice; the most
  // specific detected match becomes the preselection unless the top two
  // tie (decision: do not preselect on a tie).
  useEffect(() => {
    if (projectPath === '' || catalog === null) {
      setMatches([]);
      setDetectError(null);
      return;
    }
    let cancelled = false;
    setDetecting(true);
    setDetectError(null);
    void detectStack(projectPath, '', catalogFolders, allowBuiltin)
      .then((report) => {
        if (cancelled) return;
        setMatches(report.matches);
        const top = report.matches[0];
        const tied =
          report.matches.length >= 2 && report.matches[1]?.specificity === top?.specificity;
        setPresetName(top && !tied ? top.preset : '');
      })
      .catch((e) => {
        if (cancelled) return;
        setDetectError(toCliError(e));
        setMatches([]);
        setPresetName('');
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, catalog, catalogFolders, allowBuiltin]);

  // Sequence: after init succeeds, kick off install via the direct API
  // call (skipping the in-hook confirm). After install succeeds, the
  // wizard is done.
  useEffect(() => {
    if (phase.kind !== 'initializing') return;
    if (init.outcome.status === 'success') {
      setPhase({ kind: 'installing' });
    } else if (init.outcome.status === 'error') {
      setPhase({ kind: 'failed', error: init.outcome.error, stage: 'init' });
    }
    // status 'idle' (user dismissed a modal) leaves the phase paused on
    // 'initializing' until the user retries Set up.
  }, [init.outcome, phase.kind]);

  useEffect(() => {
    if (phase.kind !== 'installing') return;
    let cancelled = false;
    void (async () => {
      try {
        await runInstall('', projectPath, catalogFolders, allowBuiltin);
        if (cancelled) return;
        onComplete(projectPath, presetName);
      } catch (e) {
        if (cancelled) return;
        setPhase({ kind: 'failed', error: toCliError(e), stage: 'install' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.kind, projectPath, catalogFolders, allowBuiltin, presetName, onComplete]);

  const allPresets = useMemo(() => {
    const cat = catalog?.presets ?? [];
    const matchedNames = new Set(matches.map((m) => m.preset));
    const matched = matches
      .map((m) => cat.find((p) => p.name === m.preset))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const rest = cat.filter((p) => !matchedNames.has(p.name));
    return { matched, rest };
  }, [catalog, matches]);

  const handleBrowse = async (): Promise<void> => {
    try {
      const result = await openDialog({ directory: true, multiple: false });
      const selected = typeof result === 'string' ? result : null;
      if (selected !== null) {
        setProjectPath(selected);
      }
    } catch {
      // ignore picker failures — user can type the path manually.
    }
  };

  const handleSetUp = (): void => {
    if (presetName === '' || projectPath === '') return;
    setPhase({ kind: 'initializing' });
    void init.initialize(presetName);
  };

  const handleRetry = (): void => {
    if (phase.kind !== 'failed') return;
    if (phase.stage === 'init') {
      setPhase({ kind: 'initializing' });
      void init.initialize(presetName);
    } else {
      setPhase({ kind: 'installing' });
    }
  };

  const canAdvance = step === 1 && projectPath !== '' && presetName !== '' && catalog !== null;
  const isBusy = phase.kind === 'initializing' || phase.kind === 'installing';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Claude Framework</h1>
          <StepIndicator current={step} />
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
        >
          Skip →
        </button>
      </header>

      {catalog === null && catalogError !== null && (
        <NoCatalogBanner error={catalogError} onOpenSettings={onOpenSettings} />
      )}

      {step === 1 ? (
        <Step1
          projectPath={projectPath}
          onProjectPathChange={setProjectPath}
          onBrowse={handleBrowse}
          matches={matches}
          allPresets={allPresets}
          presetName={presetName}
          onPresetChange={setPresetName}
          detecting={detecting}
          detectError={detectError}
        />
      ) : (
        <Step2
          projectPath={projectPath}
          presetName={presetName}
          phase={phase}
          onSetUp={handleSetUp}
          onRetry={handleRetry}
          isBusy={isBusy}
        />
      )}

      <footer className="flex items-center justify-between border-t border-zinc-800 pt-4">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={isBusy}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors',
              isBusy && 'opacity-50 cursor-not-allowed',
            )}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        ) : (
          <span />
        )}
        {step === 1 && (
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canAdvance}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors',
              !canAdvance && 'opacity-50 cursor-not-allowed',
            )}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </footer>
    </div>
  );
}

type NoCatalogBannerProps = {
  readonly error: CliError;
  readonly onOpenSettings: () => void;
};

function NoCatalogBanner({ error, onOpenSettings }: NoCatalogBannerProps) {
  const isNoSource = error.code === 'NO_CATALOG_SOURCE';
  return (
    <div className="bg-amber-950/50 border border-amber-900/50 rounded-lg p-4 space-y-2">
      <p className="text-sm text-amber-300 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {isNoSource ? 'No catalog source configured' : 'Catalog failed to load'}
      </p>
      <p className="text-xs text-amber-200/80">
        {isNoSource
          ? 'The wizard needs at least one catalog source to suggest a preset. Enable the built-in catalog or add a user folder in Settings.'
          : error.message}
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-900/50 hover:bg-amber-900 text-amber-100 border border-amber-900 transition-colors"
      >
        Open settings
      </button>
    </div>
  );
}

function StepIndicator({ current }: { readonly current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span
          className={cn('w-2 h-2 rounded-full', current === 1 ? 'bg-violet-500' : 'bg-zinc-700')}
        />
        Choose project
      </span>
      <span className="text-zinc-700">·</span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn('w-2 h-2 rounded-full', current === 2 ? 'bg-violet-500' : 'bg-zinc-700')}
        />
        Set up
      </span>
    </div>
  );
}

type Step1Props = {
  readonly projectPath: string;
  readonly onProjectPathChange: (value: string) => void;
  readonly onBrowse: () => void;
  readonly matches: readonly DetectMatch[];
  readonly allPresets: {
    readonly matched: ReadonlyArray<NonNullable<CatalogReport['presets'][number]>>;
    readonly rest: ReadonlyArray<NonNullable<CatalogReport['presets'][number]>>;
  };
  readonly presetName: string;
  readonly onPresetChange: (value: string) => void;
  readonly detecting: boolean;
  readonly detectError: CliError | null;
};

function Step1(props: Step1Props) {
  const {
    projectPath,
    onProjectPathChange,
    onBrowse,
    matches,
    allPresets,
    presetName,
    onPresetChange,
    detecting,
    detectError,
  } = props;

  const tied = matches.length >= 2 && matches[1]?.specificity === matches[0]?.specificity;
  const winner = matches[0];

  return (
    <div className="space-y-4">
      <div>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Project folder
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={projectPath}
              onChange={(e) => onProjectPathChange(e.target.value)}
              placeholder="/path/to/project"
              spellCheck={false}
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
        </label>
      </div>

      {projectPath !== '' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label
              htmlFor="welcome-preset-select"
              className="text-xs font-medium text-zinc-400 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Preset
            </label>
            {detecting ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Detecting your stack…
              </div>
            ) : (
              <select
                id="welcome-preset-select"
                value={presetName}
                onChange={(e) => onPresetChange(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:border-violet-500 focus:outline-none [color-scheme:dark]"
              >
                <option value="">Choose a preset…</option>
                {allPresets.matched.length > 0 && (
                  <optgroup label="Detected">
                    {allPresets.matched.map((p) => {
                      const spec = matches.find((m) => m.preset === p.name)?.specificity ?? 0;
                      return (
                        <option key={p.name} value={p.name}>
                          {p.name} (specificity {spec})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {allPresets.rest.length > 0 && (
                  <optgroup label="Other presets">
                    {allPresets.rest.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
          {winner && !tied && (
            <p className="text-[11px] text-emerald-400">
              ✓ Detected: <span className="font-medium">{winner.preset}</span> preselected
              automatically.
            </p>
          )}
          {winner && tied && (
            <p className="text-[11px] text-amber-400">
              Several presets matched equally. Pick one to continue.
            </p>
          )}
          {!winner && !detecting && matches.length === 0 && projectPath !== '' && (
            <p className="text-[11px] text-zinc-500 italic">
              No automatic match — pick a preset manually.
            </p>
          )}
          {detectError !== null && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Detection failed: {detectError.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Step2Props = {
  readonly projectPath: string;
  readonly presetName: string;
  readonly phase: Phase;
  readonly onSetUp: () => void;
  readonly onRetry: () => void;
  readonly isBusy: boolean;
};

function Step2(props: Step2Props) {
  const { projectPath, presetName, phase, onSetUp, onRetry, isBusy } = props;
  return (
    <div className="space-y-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded p-4 space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-400">Summary</h3>
        <div className="text-sm space-y-1">
          <div className="flex gap-2">
            <span className="text-zinc-500 w-20">Project:</span>
            <span className="font-mono text-zinc-100 break-all">{projectPath}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-500 w-20">Preset:</span>
            <span className="font-medium text-zinc-100">{presetName}</span>
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-2 mt-2 text-[11px] text-zinc-500 space-y-1">
          <p>Will:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Write the project manifest (.claude-fw.yaml)</li>
            <li>Materialize the preset artifacts into .claude/</li>
            <li>Install git hooks and activate core.hooksPath</li>
          </ul>
        </div>
      </div>

      {phase.kind === 'initializing' && (
        <p className="text-xs text-violet-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Initializing the project…
        </p>
      )}
      {phase.kind === 'installing' && (
        <p className="text-xs text-violet-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Installing the preset…
        </p>
      )}
      {phase.kind === 'failed' && (
        <div className="bg-red-950/50 border border-red-900/50 rounded p-3 space-y-2">
          <p className="text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {phase.stage === 'init' ? 'Initialize failed' : 'Install failed'}: {phase.error.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-900/50 hover:bg-red-900 text-red-100 border border-red-900 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onSetUp}
        disabled={isBusy || phase.kind === 'failed'}
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors',
          (isBusy || phase.kind === 'failed') && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Sparkles className="w-4 h-4" />
        {isBusy ? 'Setting up…' : 'Set up project'}
      </button>
    </div>
  );
}
