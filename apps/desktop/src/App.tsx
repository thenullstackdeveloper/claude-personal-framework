import { ask, open } from '@tauri-apps/plugin-dialog';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CatalogView } from './components/catalog-view';
import { InstallReport } from './components/install-report';
import { SetupForm } from './components/setup-form';
import { StatusView } from './components/status-view';
import {
  type CatalogReport,
  type InstallReport as InstallReportData,
  type PathDetection,
  type StatusReport,
  detectPath,
  initialize,
  install,
  listCatalog,
  status,
} from './lib/api';
import { usePersistedState } from './lib/persisted-state';

type InstallOutcome =
  | { status: 'idle' }
  | { status: 'success'; data: InstallReportData }
  | { status: 'error'; error: string };

type InitOutcome =
  | { status: 'idle' }
  | { status: 'success'; presetName: string; manifestPath: string }
  | { status: 'error'; error: string };

function App() {
  const [frameworkRoot, setFrameworkRoot] = usePersistedState('cfw.frameworkRoot', '');
  const [projectRoot, setProjectRoot] = usePersistedState('cfw.projectRoot', '');

  const [catalog, setCatalog] = useState<CatalogReport | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [projectDetection, setProjectDetection] = useState<PathDetection | null>(null);

  const [statusReport, setStatusReport] = useState<StatusReport | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [installOutcome, setInstallOutcome] = useState<InstallOutcome>({ status: 'idle' });
  const [installing, setInstalling] = useState(false);

  const [initOutcome, setInitOutcome] = useState<InitOutcome>({ status: 'idle' });
  const [initializing, setInitializing] = useState(false);

  // Re-detect project role whenever the project root changes. Best-effort:
  // a failed detection clears the cached value rather than surfacing.
  useEffect(() => {
    if (!projectRoot) {
      setProjectDetection(null);
      return;
    }
    let cancelled = false;
    detectPath(projectRoot)
      .then((d) => {
        if (!cancelled) setProjectDetection(d);
      })
      .catch(() => {
        if (!cancelled) setProjectDetection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  const handleBrowseFramework = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select framework root',
      ...(frameworkRoot && { defaultPath: frameworkRoot }),
    });
    if (typeof selected !== 'string') return;
    setFrameworkRoot(selected);

    if (!projectRoot) {
      try {
        const detection = await detectPath(selected);
        if (detection.isProject) setProjectRoot(selected);
      } catch {
        // ignore — detection is a convenience, not required
      }
    }
  };

  const handleBrowseProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select project root',
      ...(projectRoot && { defaultPath: projectRoot }),
    });
    if (typeof selected !== 'string') return;
    setProjectRoot(selected);

    if (!frameworkRoot) {
      try {
        const detection = await detectPath(selected);
        if (detection.isFramework) setFrameworkRoot(selected);
      } catch {
        // ignore
      }
    }
  };

  const handleLoadCatalog = async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const data = await listCatalog(frameworkRoot);
      setCatalog(data);
    } catch (e) {
      setCatalog(null);
      setCatalogError(toErrorMessage(e));
    } finally {
      setLoadingCatalog(false);
    }
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    setStatusError(null);
    try {
      const data = await status(frameworkRoot, projectRoot);
      setStatusReport(data);
    } catch (e) {
      setStatusReport(null);
      setStatusError(toErrorMessage(e));
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleInitialize = async (presetName: string) => {
    setInitializing(true);
    setInitOutcome({ status: 'idle' });
    try {
      const data = await initialize(frameworkRoot, projectRoot, presetName);
      setInitOutcome({
        status: 'success',
        presetName: data.presetName,
        manifestPath: data.manifestPath,
      });
      // Refresh detection so the UI flips to "Install" mode.
      try {
        const fresh = await detectPath(projectRoot);
        setProjectDetection(fresh);
      } catch {
        // ignore
      }
    } catch (e) {
      setInitOutcome({ status: 'error', error: toErrorMessage(e) });
    } finally {
      setInitializing(false);
    }
  };

  const handleInstall = async () => {
    const confirmMsg = buildConfirmMessage(projectRoot, statusReport);
    const confirmed = await ask(confirmMsg, {
      title: 'Confirm install',
      kind: 'warning',
      okLabel: 'Install',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setInstalling(true);
    setInstallOutcome({ status: 'idle' });
    try {
      const data = await install(frameworkRoot, projectRoot);
      setInstallOutcome({ status: 'success', data });
      try {
        const fresh = await status(frameworkRoot, projectRoot);
        setStatusReport(fresh);
      } catch {
        // ignore — status refresh is best-effort
      }
    } catch (e) {
      setInstallOutcome({ status: 'error', error: toErrorMessage(e) });
    } finally {
      setInstalling(false);
    }
  };

  const dismissInstallOutcome = () => setInstallOutcome({ status: 'idle' });
  const dismissInitOutcome = () => setInitOutcome({ status: 'idle' });
  const dismissStatus = () => {
    setStatusReport(null);
    setStatusError(null);
  };

  const hasAnyPath = frameworkRoot !== '' || projectRoot !== '';
  const showEmptyState =
    !hasAnyPath &&
    !catalog &&
    !statusReport &&
    installOutcome.status === 'idle' &&
    initOutcome.status === 'idle';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1.5 pb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Claude Framework</h1>
          <p className="text-sm text-zinc-400">
            Install reusable Claude Code agents, skills and commands into any project.
          </p>
        </header>

        <SetupForm
          frameworkRoot={frameworkRoot}
          projectRoot={projectRoot}
          onFrameworkRootChange={setFrameworkRoot}
          onProjectRootChange={setProjectRoot}
          onBrowseFramework={handleBrowseFramework}
          onBrowseProject={handleBrowseProject}
          onLoadCatalog={handleLoadCatalog}
          onCheckStatus={handleCheckStatus}
          onInstall={handleInstall}
          onInitialize={handleInitialize}
          loadingCatalog={loadingCatalog}
          checkingStatus={checkingStatus}
          installing={installing}
          initializing={initializing}
          projectDetection={projectDetection}
          presets={catalog?.presets ?? []}
        />

        {initOutcome.status === 'success' && (
          <section className="bg-emerald-950/40 border border-emerald-900 rounded-lg p-4 text-sm text-emerald-100 flex items-start justify-between gap-4">
            <div>
              <strong className="font-semibold">Project initialized.</strong>{' '}
              <span className="text-emerald-200/80">
                Preset <span className="font-mono">{initOutcome.presetName}</span>, manifest at{' '}
                <span className="font-mono text-xs">{initOutcome.manifestPath}</span>. You can
                install now.
              </span>
            </div>
            <button
              type="button"
              onClick={dismissInitOutcome}
              className="text-emerald-300/80 hover:text-emerald-100 text-xs"
            >
              dismiss
            </button>
          </section>
        )}
        {initOutcome.status === 'error' && (
          <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-sm text-red-200 flex items-start justify-between gap-4">
            <div>
              <strong className="font-semibold">Initialize failed: </strong>
              <span className="font-mono text-xs text-red-300/80">{initOutcome.error}</span>
            </div>
            <button
              type="button"
              onClick={dismissInitOutcome}
              className="text-red-300/80 hover:text-red-100 text-xs"
            >
              dismiss
            </button>
          </section>
        )}

        {installOutcome.status === 'success' && (
          <InstallReport
            status="success"
            data={installOutcome.data}
            onDismiss={dismissInstallOutcome}
          />
        )}
        {installOutcome.status === 'error' && (
          <InstallReport
            status="error"
            error={installOutcome.error}
            onDismiss={dismissInstallOutcome}
          />
        )}

        {statusError && (
          <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-sm text-red-200">
            <strong className="font-semibold">Status check failed: </strong>
            <span className="font-mono text-xs text-red-300/80">{statusError}</span>
          </section>
        )}

        {statusReport && <StatusView report={statusReport} onDismiss={dismissStatus} />}

        {catalogError && (
          <section className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-sm text-red-200">
            <strong className="font-semibold">Catalog load failed: </strong>
            <span className="font-mono text-xs text-red-300/80">{catalogError}</span>
          </section>
        )}

        {catalog && <CatalogView report={catalog} />}

        {showEmptyState && <EmptyState />}
      </div>
    </div>
  );
}

function buildConfirmMessage(projectRoot: string, statusReport: StatusReport | null): string {
  if (!statusReport) {
    return `Install into ${projectRoot}?\n\nThis replaces .claude/agents, .claude/skills and .claude/commands in that folder.`;
  }
  const totalDrift =
    statusReport.added.length + statusReport.updated.length + statusReport.removed.length;
  if (totalDrift === 0) {
    return `Install into ${projectRoot}?\n\nAll artifacts already match the catalog. Running install will rewrite them with identical content.`;
  }
  const parts: string[] = [];
  if (statusReport.added.length > 0) parts.push(`+${statusReport.added.length} added`);
  if (statusReport.updated.length > 0) parts.push(`~${statusReport.updated.length} updated`);
  if (statusReport.removed.length > 0) parts.push(`-${statusReport.removed.length} removed`);
  return `Install into ${projectRoot}?\n\nPending changes: ${parts.join(', ')}.\nUnchanged artifacts (${statusReport.unchanged.length}) will be rewritten with identical content.`;
}

function EmptyState() {
  return (
    <section className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg p-8 text-center space-y-2">
      <Sparkles className="w-8 h-8 text-zinc-600 mx-auto" />
      <h2 className="text-sm font-semibold text-zinc-400">No paths configured yet</h2>
      <p className="text-xs text-zinc-500 max-w-md mx-auto">
        Pick a framework root and a project root above to load the catalog, check status against the
        last install, initialize a brand-new project, or install a preset.
      </p>
    </section>
  );
}

function toErrorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

export default App;
