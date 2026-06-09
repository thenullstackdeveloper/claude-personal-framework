import {
  CatalogReader,
  ChildProcessGitConfig,
  ClaudeWriter,
  FsManifestStore,
  FsProjectInspector,
  LockfileStore,
  install,
} from '@claude-fw/core';

export type InstallCommandArgs = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
};

export type InstallCommandReport = {
  readonly presetName: string;
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
  readonly settings: boolean;
  readonly instructions: boolean;
  readonly gitHooks: readonly string[];
  readonly gitConfigActivated: boolean;
  readonly gitConfigCurrent: string | null;
};

export const runInstall = async (args: InstallCommandArgs): Promise<InstallCommandReport> => {
  const manifestStore = new FsManifestStore(args.projectRoot);
  const manifest = await manifestStore.read();
  if (manifest === null) {
    throw new Error(
      `No .claude-fw.yaml found at ${args.projectRoot}. Run 'claude-fw init --preset <name>' first to create one.`,
    );
  }

  const catalog = new CatalogReader(args.frameworkRoot);
  const writer = new ClaudeWriter(args.projectRoot);
  const lockfileStore = new LockfileStore(args.projectRoot);
  const inspector = new FsProjectInspector(args.projectRoot);
  const gitConfig = new ChildProcessGitConfig(args.projectRoot);

  const result = await install({
    manifest,
    projectPath: args.projectRoot,
    catalog,
    writer,
    lockfileStore,
    inspector,
    gitConfig,
  });

  return {
    presetName: manifest.presetName.toString(),
    agents: result.written.agents.map(String),
    skills: result.written.skills.map(String),
    commands: result.written.commands.map(String),
    settings: result.written.settings,
    instructions: result.written.instructions,
    gitHooks: result.written.gitHooks.map(String),
    gitConfigActivated: result.written.gitConfigActivated,
    gitConfigCurrent: result.written.gitConfigCurrent,
  };
};

export const formatInstallReport = (report: InstallCommandReport): string => {
  const lines: string[] = [`Installed preset "${report.presetName}":`];
  const section = (label: string, items: readonly string[]) => {
    if (items.length === 0) return;
    lines.push(`  ${label} (${items.length}):`);
    for (const item of items) lines.push(`    - ${item}`);
  };
  section('Agents', report.agents);
  section('Skills', report.skills);
  section('Commands', report.commands);
  section('Git hooks', report.gitHooks);
  if (report.settings) lines.push('  Settings: .claude/settings.json written.');
  if (report.instructions) lines.push('  Instructions: .claude/CLAUDE.md written.');
  if (report.gitHooks.length > 0) {
    if (report.gitConfigActivated) {
      lines.push('  Git config: set core.hooksPath = .githooks');
    } else if (report.gitConfigCurrent !== null) {
      lines.push(
        `  Git config: core.hooksPath = ${report.gitConfigCurrent} — left as is (already set).`,
      );
    }
  }
  const totalArtifacts =
    report.agents.length + report.skills.length + report.commands.length + report.gitHooks.length;
  if (totalArtifacts === 0 && !report.settings && !report.instructions) {
    lines.push('  (no artifacts to install)');
  }
  return lines.join('\n');
};

export const formatInstallReportJson = (report: InstallCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
