import { ask, open } from '@tauri-apps/plugin-dialog';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CatalogView } from './components/catalog-view';
import { InstallReport } from './components/install-report';
import { SetupForm } from './components/setup-form';
import {
  type CatalogReport,
  type InstallReport as InstallReportData,
  detectPath,
  install,
  listCatalog,
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

    // Smart fill: if the selected folder is also a project (has .claude-fw.yaml)
    // and project root is still empty, suggest it there too. Dogfooding helper.
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

  const handleInstall = async () => {
    const confirmed = await ask(
      `Install into ${projectRoot}?\n\nThis replaces .claude/agents, .claude/skills and .claude/commands in that folder.`,
      {
        title: 'Confirm install',
        kind: 'warning',
        okLabel: 'Install',
        cancelLabel: 'Cancel',
      },
    );
    if (!confirmed) return;

    setInstalling(true);
    setInstallOutcome({ status: 'idle' });
    try {
      const data = await install(frameworkRoot, projectRoot);
      setInstallOutcome({ status: 'success', data });
    } catch (e) {
      setInstallOutcome({ status: 'error', error: toErrorMessage(e) });
    } finally {
      setInstalling(false);
    }
  };

  const dismissInstallOutcome = () => setInstallOutcome({ status: 'idle' });

  const hasAnyPath = frameworkRoot !== '' || projectRoot !== '';
  const showEmptyState = !hasAnyPath && !catalog && installOutcome.status === 'idle';

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
          onInstall={handleInstall}
          loadingCatalog={loadingCatalog}
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

function EmptyState() {
  return (
    <section className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-lg p-8 text-center space-y-2">
      <Sparkles className="w-8 h-8 text-zinc-600 mx-auto" />
      <h2 className="text-sm font-semibold text-zinc-400">No paths configured yet</h2>
      <p className="text-xs text-zinc-500 max-w-md mx-auto">
        Pick a framework root and a project root above to load the catalog or install a preset. If
        you select a folder that is both, the other field is filled automatically.
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
