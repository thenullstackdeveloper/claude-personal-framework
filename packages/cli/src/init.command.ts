import { join } from 'node:path';
import { CatalogReader, FsManifestStore, PresetName, initProject } from '@claude-fw/core';

const MANIFEST_FILENAME = '.claude-fw.yaml';

export type InitCommandArgs = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
  readonly presetName: string;
};

export type InitCommandReport = {
  readonly projectRoot: string;
  readonly presetName: string;
  readonly manifestPath: string;
};

export const runInit = async (args: InitCommandArgs): Promise<InitCommandReport> => {
  const catalog = new CatalogReader(args.frameworkRoot);
  const manifestStore = new FsManifestStore(args.projectRoot);

  await initProject({
    presetName: PresetName.of(args.presetName),
    catalog,
    manifestStore,
  });

  return {
    projectRoot: args.projectRoot,
    presetName: args.presetName,
    manifestPath: join(args.projectRoot, MANIFEST_FILENAME),
  };
};

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
