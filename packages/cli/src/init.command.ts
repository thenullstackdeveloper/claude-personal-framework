import { spawn } from 'node:child_process';
import { join } from 'node:path';
import {
  CatalogReader,
  FsManifestStore,
  LocalProjectInspector,
  NotAGitRepoError,
  PresetName,
  initProject,
} from '@claude-fw/core';

const MANIFEST_FILENAME = '.claude-fw.yaml';

export type InitCommandArgs = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly presetName: string;
  /**
   * When true, a NotAGitRepoError from the engine is auto-resolved by
   * running `git init` in the project root and retrying once. Without
   * the flag the error bubbles up — the CLI stays strict so scripts and
   * humans see exactly what is wrong (and the desktop UI gets its own
   * modal flow).
   */
  readonly initGit?: boolean;
};

export type InitCommandReport = {
  readonly projectRoot: string;
  readonly presetName: string;
  readonly manifestPath: string;
};

export const runInit = async (args: InitCommandArgs): Promise<InitCommandReport> => {
  const catalog = new CatalogReader(args.frameworkRoot);
  const manifestStore = new FsManifestStore(args.projectRoot);
  const inspector = new LocalProjectInspector(args.projectRoot);

  const attempt = () =>
    initProject({
      presetName: PresetName.of(args.presetName),
      projectRoot: args.projectRoot,
      catalog,
      manifestStore,
      inspector,
    });

  try {
    await attempt();
  } catch (err) {
    if (err instanceof NotAGitRepoError && args.initGit) {
      await runGitInit(args.projectRoot);
      await attempt();
    } else {
      throw err;
    }
  }

  return {
    projectRoot: args.projectRoot,
    presetName: args.presetName,
    manifestPath: join(args.projectRoot, MANIFEST_FILENAME),
  };
};

const runGitInit = (cwd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['init', '-q'], { cwd });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git init failed (exit ${code}): ${stderr.trim()}`));
    });
  });

export const formatInitReport = (report: InitCommandReport): string => {
  return [
    `Initialized project at: ${report.projectRoot}`,
    `Preset: ${report.presetName}`,
    `Manifest: ${report.manifestPath}`,
    '',
    "Run 'claude-fw install' next to materialize the preset.",
  ].join('\n');
};

export const formatInitReportJson = (report: InitCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
