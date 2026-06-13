import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors the Rust `CliError` struct. Tauri serializes `Err(_)` from a
 * `#[tauri::command]` to the JS side as an object, so the promise rejection
 * already arrives as `{ code, message }` — `toCliError()` exists only to
 * normalize unexpected shapes (network/system errors, etc.) into the same
 * type so callers always branch on `code`.
 */
export type CliError = {
  readonly code: string;
  readonly message: string;
  /** Populated only when `code === 'UNMANAGED_GIT_HOOK'`. */
  readonly hookName?: string;
  /** Populated only when `code === 'NOT_A_GIT_REPO'`. */
  readonly projectRoot?: string;
};

export const toCliError = (e: unknown): CliError => {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const { code, message, hookName, projectRoot } = e as {
      code: unknown;
      message: unknown;
      hookName?: unknown;
      projectRoot?: unknown;
    };
    if (typeof code === 'string' && typeof message === 'string') {
      const base: CliError = { code, message };
      const withHook = typeof hookName === 'string' ? { ...base, hookName } : base;
      return typeof projectRoot === 'string' ? { ...withHook, projectRoot } : withHook;
    }
  }
  if (typeof e === 'string') return { code: 'CLI_FAILURE', message: e };
  if (e instanceof Error) return { code: 'CLI_FAILURE', message: e.message };
  return { code: 'CLI_FAILURE', message: JSON.stringify(e) };
};

export type ListPreset = {
  readonly name: string;
  readonly extends: readonly string[];
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
  readonly instructions: readonly string[];
  readonly gitHooks: readonly string[];
};

export type ListArtifact = {
  readonly id: string;
  readonly description: string;
};

export type GitHookSummary = {
  readonly hookName: string;
};

export type CatalogReport = {
  readonly presets: readonly ListPreset[];
  readonly agents: readonly ListArtifact[];
  readonly skills: readonly ListArtifact[];
  readonly commands: readonly ListArtifact[];
  readonly instructions: readonly ListArtifact[];
  readonly gitHooks: readonly GitHookSummary[];
};

export type InstallReport = {
  readonly presetName: string;
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
  readonly settings: boolean;
  readonly instructions: boolean;
  readonly gitHooks: readonly string[];
  readonly gitConfigActivated: boolean;
  readonly gitConfigCurrent: string | null;
  readonly gitConfigSkippedReason: 'not-a-git-repo' | null;
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

export type StatusSingleton =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'added' }
  | { readonly kind: 'removed'; readonly oldSha: string }
  | { readonly kind: 'updated'; readonly oldSha: string; readonly newSha: string };

export type StatusReport = {
  readonly presetName: string;
  readonly hasLockfile: boolean;
  readonly added: readonly StatusArtifact[];
  readonly updated: readonly StatusUpdate[];
  readonly removed: readonly StatusArtifact[];
  readonly unchanged: readonly StatusArtifact[];
  readonly settings: StatusSingleton;
  readonly instructions: StatusSingleton;
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

export const ensureGitRepo = (path: string): Promise<void> => {
  return invoke<void>('ensure_git_repo', { path });
};
