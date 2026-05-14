import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CatalogReader,
  ClaudeWriter,
  LockfileStore,
  install,
  parseProjectManifest,
} from '@claude-fw/core';

const MANIFEST_FILENAME = '.claude-fw.yaml';

export type InstallCommandArgs = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
};

export type InstallCommandReport = {
  readonly presetName: string;
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
};

export const runInstall = async (args: InstallCommandArgs): Promise<InstallCommandReport> => {
  const manifestPath = join(args.projectRoot, MANIFEST_FILENAME);
  const manifestYaml = await readFile(manifestPath, 'utf-8');
  const manifest = parseProjectManifest(manifestYaml);

  const catalog = new CatalogReader(args.frameworkRoot);
  const writer = new ClaudeWriter(args.projectRoot);
  const lockfileStore = new LockfileStore(args.projectRoot);

  const result = await install({
    manifest,
    projectPath: args.projectRoot,
    catalog,
    writer,
    lockfileStore,
  });

  return {
    presetName: manifest.presetName.toString(),
    agents: result.written.agents.map(String),
    skills: result.written.skills.map(String),
    commands: result.written.commands.map(String),
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
  if (report.agents.length + report.skills.length + report.commands.length === 0) {
    lines.push('  (no artifacts to install)');
  }
  return lines.join('\n');
};

export const formatInstallReportJson = (report: InstallCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
