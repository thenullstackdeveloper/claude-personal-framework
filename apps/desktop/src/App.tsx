import { useState } from 'react';
import { CatalogView } from './components/catalog-view';
import { InstallReport } from './components/install-report';
import { SetupForm } from './components/setup-form';
import {
  type CatalogReport,
  type InstallReport as InstallReportData,
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
      </div>
    </div>
  );
}

function toErrorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

export default App;
