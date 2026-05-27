import { invoke } from '@tauri-apps/api/core';

export type ListPreset = {
  readonly name: string;
  readonly extends: readonly string[];
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
};

export type ListArtifact = {
  readonly id: string;
  readonly description: string;
};

export type CatalogReport = {
  readonly presets: readonly ListPreset[];
  readonly agents: readonly ListArtifact[];
  readonly skills: readonly ListArtifact[];
  readonly commands: readonly ListArtifact[];
};

export type InstallReport = {
  readonly presetName: string;
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
};

export const listCatalog = (frameworkRoot: string): Promise<CatalogReport> => {
  return invoke<CatalogReport>('list_catalog', { frameworkRoot });
};

export const install = (frameworkRoot: string, projectRoot: string): Promise<InstallReport> => {
  return invoke<InstallReport>('install', { frameworkRoot, projectRoot });
};

export type PathDetection = {
  readonly isFramework: boolean;
  readonly isProject: boolean;
};

export const detectPath = (path: string): Promise<PathDetection> => {
  return invoke<PathDetection>('detect_path', { path });
};

export type StatusArtifact = {
  readonly type: string;
  readonly id: string;
};

export type StatusUpdate = {
  readonly type: string;
  readonly id: string;
  readonly oldSha: string;
  readonly newSha: string;
};

export type StatusReport = {
  readonly presetName: string;
  readonly hasLockfile: boolean;
  readonly added: readonly StatusArtifact[];
  readonly updated: readonly StatusUpdate[];
  readonly removed: readonly StatusArtifact[];
  readonly unchanged: readonly StatusArtifact[];
};

export const status = (frameworkRoot: string, projectRoot: string): Promise<StatusReport> => {
  return invoke<StatusReport>('status', { frameworkRoot, projectRoot });
};

export type InitReport = {
  readonly projectRoot: string;
  readonly presetName: string;
  readonly manifestPath: string;
};

export const initialize = (
  frameworkRoot: string,
  projectRoot: string,
  presetName: string,
): Promise<InitReport> => {
  return invoke<InitReport>('initialize', { frameworkRoot, projectRoot, presetName });
};
