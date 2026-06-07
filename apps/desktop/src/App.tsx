import { Sparkles } from 'lucide-react';
import { CatalogView } from './components/catalog-view';
import { ErrorBanner } from './components/error-banner';
import { InitReport } from './components/init-report';
import { InstallReport } from './components/install-report';
import { SetupForm } from './components/setup-form';
import { StatusView } from './components/status-view';
import { useCatalogFlow } from './hooks/use-catalog-flow';
import { useDetectPath } from './hooks/use-detect-path';
import { useInitFlow } from './hooks/use-init-flow';
import { useInstallFlow } from './hooks/use-install-flow';
import { usePathPicker } from './hooks/use-path-picker';
import { useStatusFlow } from './hooks/use-status-flow';
import { detectPath } from './lib/api';
import { usePersistedState } from './lib/persisted-state';

function App() {
  const [frameworkRoot, setFrameworkRoot] = usePersistedState('cfw.frameworkRoot', '');
  const [projectRoot, setProjectRoot] = usePersistedState('cfw.projectRoot', '');

  const {
    catalog,
    error: catalogError,
    loading: loadingCatalog,
    load: handleLoadCatalog,
    dismissError: dismissCatalogError,
  } = useCatalogFlow(frameworkRoot);

  const { detection: projectDetection, refresh: refreshProjectDetection } =
    useDetectPath(projectRoot);

  const {
    report: statusReport,
    error: statusError,
    checking: checkingStatus,
    check: handleCheckStatus,
    checkSilently: refreshStatusSilently,
    dismiss: dismissStatus,
  } = useStatusFlow({ frameworkRoot, projectRoot });

  const {
    outcome: installOutcome,
    installing,
    install: handleInstall,
    dismiss: dismissInstallOutcome,
  } = useInstallFlow({
    frameworkRoot,
    projectRoot,
    statusReport,
    onSuccess: refreshStatusSilently,
  });

  const {
    outcome: initOutcome,
    initializing,
    initialize: handleInitialize,
    dismiss: dismissInitOutcome,
  } = useInitFlow({
    frameworkRoot,
    projectRoot,
    onSuccess: refreshProjectDetection,
  });

  const { browseFramework, browseProject } = usePathPicker();

  const handleBrowseFramework = async () => {
    const selected = await browseFramework(frameworkRoot);
    if (selected === null) return;
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
    const selected = await browseProject(projectRoot);
    if (selected === null) return;
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
          <InitReport
            status="success"
            data={{
              presetName: initOutcome.presetName,
              manifestPath: initOutcome.manifestPath,
            }}
            onDismiss={dismissInitOutcome}
          />
        )}
        {initOutcome.status === 'error' && (
          <InitReport status="error" error={initOutcome.error} onDismiss={dismissInitOutcome} />
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
            onRetry={handleInstall}
          />
        )}

        {statusError && (
          <ErrorBanner title="Status check failed" error={statusError} onDismiss={dismissStatus} />
        )}

        {statusReport && <StatusView report={statusReport} onDismiss={dismissStatus} />}

        {catalogError && (
          <ErrorBanner
            title="Catalog load failed"
            error={catalogError}
            onDismiss={dismissCatalogError}
          />
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
        Pick a framework root and a project root above to load the catalog, check status against the
        last install, initialize a brand-new project, or install a preset.
      </p>
    </section>
  );
}

export default App;
