import { ask, open } from '@tauri-apps/plugin-dialog';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CatalogView } from './components/catalog-view';
import { InstallReport } from './components/install-report';
import { SetupForm } from './components/setup-form';
import { StatusView } from './components/status-view';
import {
  type CatalogReport,
  type InstallReport as InstallReportData,
  type StatusReport,
  detectPath,
  install,
  listCatalog,
  status,
} from './lib/api';
import { usePersistedState } from './lib/persisted-state';

type InstallOutcome =
  | { status: 'idle' }
  | { status: 'success'; data: InstallReportData }
  | { status: 'error'; error: string };

function App() {
  const [frameworkRoot, setFrameworkRoot] = usePersistedState('cfw.frameworkRoot', '');
  const [projectRoot, setProjectRoot] = usePersistedState('cfw.projectRoot', '');

  const [catalog, setCatalog] = useState<CatalogReport | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [statusReport, setStatusReport] = useState<StatusReport | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [installOutcome, setInstallOutcome] = useState<InstallOutcome>({ status: 'idle' });
  const [installing, setInstalling] = useState(false);

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
      const detection = await detectPath(selected);
      if (detection.isProject) setProjectRoot(selected);
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
      const detection = await detectPath(selected);
      if (detection.isFramework) setFrameworkRoot(selected);
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
      // Refresh status after install so the user sees the clean state.
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
  const dismissStatus = () => {
    setStatusReport(null);
    setStatusError(null);
  };

  const hasAnyPath = frameworkRoot !== '' || projectRoot !== '';
  const showEmptyState =
    !hasAnyPath && !catalog && !statusReport && installOutcome.status === 'idle';

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
          loadingCatalog={loadingCatalog}
          checkingStatus={checkingStatus}
          installing={installing}
        />

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
        last install, or install a preset.
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
