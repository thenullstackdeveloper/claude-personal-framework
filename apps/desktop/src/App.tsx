import { useEffect, useRef, useState } from 'react';
import { ActionsCard, CatalogCard, StatusCard } from './components/free-mode-cards';
import { InitReport } from './components/init-report';
import { InstallReport } from './components/install-report';
import { ProjectHeader } from './components/project-header';
import { RecentProjectsScreen } from './components/recent-projects-screen';
import { SettingsPanel } from './components/settings-panel';
import { WelcomeWizard } from './components/welcome-wizard';
import { useActiveProject } from './hooks/use-active-project';
import { useAutoDismissSuccess } from './hooks/use-auto-dismiss';
import { useBuiltinCatalogPref } from './hooks/use-builtin-catalog-pref';
import { useCatalogFlow } from './hooks/use-catalog-flow';
import { useDetectPath } from './hooks/use-detect-path';
import { useInitFlow } from './hooks/use-init-flow';
import { useInstallFlow } from './hooks/use-install-flow';
import { usePathPicker } from './hooks/use-path-picker';
import { type RecentProject, useRecentProjects } from './hooks/use-recent-projects';
import { useStatusFlow } from './hooks/use-status-flow';
import { useUserCatalogFolders } from './hooks/use-user-catalog-folders';
import { useWelcomeWizardFlag } from './hooks/use-welcome-wizard-flag';

function App() {
  const { activeProject, setActiveProject } = useActiveProject();
  const { recent, add: addRecent, remove: removeRecent } = useRecentProjects();
  const userFolders = useUserCatalogFolders();
  const userCatalogFolders = userFolders.folders;
  const { useBuiltin, setUseBuiltin } = useBuiltinCatalogPref();
  const welcomeWizard = useWelcomeWizardFlag();
  const { browseProject } = usePathPicker();

  // No user-provided framework root anymore — only user folders + the
  // built-in (gated by useBuiltin) feed the catalog. The legacy frameworkRoot
  // string is kept as '' so the underlying Tauri/CLI plumbing stays uniform.
  const frameworkRoot = '';
  const projectRoot = activeProject?.path ?? '';

  const catalog = useCatalogFlow(frameworkRoot, userCatalogFolders, useBuiltin);
  const { detection: projectDetection, refresh: refreshProjectDetection } =
    useDetectPath(projectRoot);

  const status = useStatusFlow({
    frameworkRoot,
    projectRoot,
    catalogFolders: userCatalogFolders,
    allowBuiltin: useBuiltin,
  });

  const install = useInstallFlow({
    frameworkRoot,
    projectRoot,
    catalogFolders: userCatalogFolders,
    allowBuiltin: useBuiltin,
    statusReport: status.report,
    onSuccess: status.checkSilently,
  });

  const init = useInitFlow({
    frameworkRoot,
    projectRoot,
    catalogFolders: userCatalogFolders,
    allowBuiltin: useBuiltin,
    onSuccess: refreshProjectDetection,
  });

  // Auto-dismiss success outcomes after 5s (decision D1). Errors stay sticky.
  useAutoDismissSuccess(install.outcome, install.dismiss, 5000);
  useAutoDismissSuccess(init.outcome, init.dismiss, 5000);

  // Auto-load catalog on mount and whenever sources change. `load`'s ref
  // captures userCatalogFolders via its own useCallback dep, so watching
  // the function reference here is enough — biome can verify the chain.
  const loadCatalog = catalog.load;
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Cross-flow reset on project switch (CLAUDEPERS-23): wipe outcomes from
  // the previous project so they don't bleed across, and silently re-check
  // status when entering a new project (so the Status card refreshes
  // without the user pressing Check now).
  const prevPathRef = useRef<string | null>(null);
  const statusCheckSilently = status.checkSilently;
  const statusDismiss = status.dismiss;
  const installDismiss = install.dismiss;
  const initDismiss = init.dismiss;
  useEffect(() => {
    const current = activeProject?.path ?? null;
    if (current === prevPathRef.current) return;
    statusDismiss();
    installDismiss();
    initDismiss();
    prevPathRef.current = current;
    if (current) {
      void statusCheckSilently();
    }
  }, [activeProject, statusDismiss, installDismiss, initDismiss, statusCheckSilently]);

  // Recent on success (decision D6) — only add after init/install lands green.
  useEffect(() => {
    if (install.outcome.status === 'success' && activeProject) {
      addRecent({
        path: activeProject.path,
        presetName: install.outcome.data.presetName,
      });
    }
  }, [install.outcome, activeProject, addRecent]);
  useEffect(() => {
    if (init.outcome.status === 'success' && activeProject) {
      addRecent({
        path: activeProject.path,
        presetName: init.outcome.presetName,
      });
    }
  }, [init.outcome, activeProject, addRecent]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = (): void => setSettingsOpen(true);
  const closeSettings = (): void => setSettingsOpen(false);
  // Local-session "I clicked Skip" so the wizard does not re-render
  // immediately. The persisted flag stays false so the wizard reappears
  // on the next app launch, giving the user another shot.
  const [wizardSkipped, setWizardSkipped] = useState(false);
  const handleRestartWizard = (): void => {
    welcomeWizard.reset();
    setWizardSkipped(false);
    closeSettings();
  };
  const handleWizardComplete = (path: string, _presetName: string): void => {
    welcomeWizard.markCompleted();
    setActiveProject({ path });
    // Recent is updated automatically when init/install fire onSuccess.
  };
  const handleWizardSkip = (): void => {
    setWizardSkipped(true);
  };
  const showWizard = !welcomeWizard.completed && !wizardSkipped && !activeProject;

  const handleBrowse = async (): Promise<void> => {
    const selected = await browseProject(activeProject?.path ?? '');
    if (selected === null) return;
    setActiveProject({ path: selected });
  };

  // "New project (open wizard)" — clears the active project and resets the
  // local skip so the wizard takes over. The persisted completion flag is
  // left alone (the user explicitly asked for the wizard, not a reset).
  const handleNewProject = (): void => {
    setActiveProject(null);
    setWizardSkipped(false);
    welcomeWizard.reset();
  };

  const handleSelectRecent = (entry: RecentProject): void => {
    setActiveProject({ path: entry.path });
  };

  const handleRemoveRecent = (path: string): void => {
    removeRecent(path);
  };

  const handleInitialize = (): void => {
    // B6 picks the first preset in the catalog as the default — the wizard
    // (C8) will show a real selector with detect-stack. Until then this is
    // a stop-gap that mirrors the previous SetupForm initialize button.
    const firstPreset = catalog.catalog?.presets[0]?.name ?? 'base';
    void init.initialize(firstPreset);
  };

  const hasManifest = projectDetection?.isProject === true;
  const canInitialize = projectDetection?.isProject === false;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {settingsOpen && (
        <SettingsPanel
          userFolders={userFolders}
          useBuiltin={useBuiltin}
          setUseBuiltin={setUseBuiltin}
          envOverridePath={null}
          onRestartWizard={handleRestartWizard}
          onClose={closeSettings}
        />
      )}
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {showWizard ? (
          <WelcomeWizard
            catalog={catalog.catalog}
            catalogError={catalog.error}
            catalogFolders={userCatalogFolders}
            allowBuiltin={useBuiltin}
            onComplete={handleWizardComplete}
            onSkip={handleWizardSkip}
            onOpenSettings={openSettings}
          />
        ) : !activeProject ? (
          <RecentProjectsScreen
            recent={recent}
            onSelectRecent={handleSelectRecent}
            onRemoveRecent={handleRemoveRecent}
            onBrowse={handleBrowse}
            onNewProject={handleNewProject}
            onSettings={openSettings}
          />
        ) : (
          <>
            <ProjectHeader
              activeProject={activeProject}
              presetName={status.report?.presetName ?? null}
              recent={recent.filter((r) => r.path !== activeProject.path)}
              onSelectRecent={handleSelectRecent}
              onBrowse={handleBrowse}
              onNewProject={handleNewProject}
              onSettings={openSettings}
            />

            <div className="grid grid-cols-3 gap-4">
              <StatusCard
                report={status.report}
                checking={status.checking}
                hasManifest={hasManifest}
                onCheck={status.check}
              />
              <CatalogCard
                catalog={catalog.catalog}
                loading={catalog.loading}
                onLoad={catalog.load}
              />
              <ActionsCard
                hasManifest={hasManifest}
                installing={install.installing}
                initializing={init.initializing}
                canInitialize={canInitialize}
                onInstall={install.install}
                onInitialize={handleInitialize}
              />
            </div>

            {/* Ephemeral outcomes (D1): success auto-dismisses in 5s, errors sticky. */}
            {init.outcome.status === 'success' && (
              <InitReport
                status="success"
                data={{
                  presetName: init.outcome.presetName,
                  manifestPath: init.outcome.manifestPath,
                }}
                onDismiss={init.dismiss}
              />
            )}
            {init.outcome.status === 'error' && (
              <InitReport status="error" error={init.outcome.error} onDismiss={init.dismiss} />
            )}
            {install.outcome.status === 'success' && (
              <InstallReport
                status="success"
                data={install.outcome.data}
                onDismiss={install.dismiss}
              />
            )}
            {install.outcome.status === 'error' && (
              <InstallReport
                status="error"
                error={install.outcome.error}
                onDismiss={install.dismiss}
                onRetry={install.install}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
