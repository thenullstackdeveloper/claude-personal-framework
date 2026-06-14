import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CatalogPort,
  FsManifestStore,
  LocalProjectInspector,
  NotAGitRepoError,
  PresetName,
  ProjectDirMissingError,
  initProject,
} from '@claude-fw/core';

const MANIFEST_FILENAME = '.claude-fw.yaml';

export type InitCommandArgs = {
  readonly catalog: CatalogPort;
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
  /**
   * When true, a ProjectDirMissingError from the engine is auto-resolved
   * by `mkdir -p`-ing the project root and retrying once. Without it the
   * error bubbles up — mirrors --init-git: strict by default, opt-in
   * convenience flag for scripting.
   */
  readonly createDir?: boolean;
};

export type InitCommandReport = {
  readonly projectRoot: string;
  readonly presetName: string;
  readonly manifestPath: string;
};

export const runInit = async (args: InitCommandArgs): Promise<InitCommandReport> => {
  const manifestStore = new FsManifestStore(args.projectRoot);
  const inspector = new LocalProjectInspector(args.projectRoot);

  const attempt = () =>
    initProject({
      presetName: PresetName.of(args.presetName),
      projectRoot: args.projectRoot,
      catalog: args.catalog,
      manifestStore,
      inspector,
    });

  // Auto-resolve loop: each iteration runs initProject; if it throws a
  // typed error the user opted into auto-resolving via flag, we apply the
  // fix and retry. Capped at MAX_ATTEMPTS to keep a misbehaving resolver
  // from looping forever — the natural chain ("missing dir → mkdir → not
  // a repo → git init → success") fits within 3 attempts.
  const MAX_ATTEMPTS = 3;
  for (let attempt_no = 0; attempt_no < MAX_ATTEMPTS; attempt_no++) {
    try {
      await attempt();
      break;
    } catch (err) {
      if (err instanceof ProjectDirMissingError && args.createDir) {
        await mkdir(args.projectRoot, { recursive: true });
        continue;
      }
      if (err instanceof NotAGitRepoError && args.initGit) {
        await runGitInit(args.projectRoot);
        continue;
      }
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
