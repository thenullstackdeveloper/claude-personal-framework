import { invoke } from '@tauri-apps/api/core';

/**
 * Report DTOs are imported from `@claude-fw/cli/reports` so the CLI stays
 * the source of truth for their shape. The Rust side still maintains its
 * own structs (it's a transit layer that deserializes the CLI JSON and
 * re-emits it via Tauri), but the desktop UI and the CLI no longer drift.
 * See ADR-0005.
 */
export type {
  CatalogReport,
  DetectStackMatch,
  DetectStackReport,
  GitHookSummary,
  InitReport,
  InstallReport,
  ListArtifact,
  ListPreset,
  StatusArtifact,
  StatusReport,
  StatusSingleton,
  StatusUpdate,
} from '@claude-fw/cli/reports';

/**
 * Mirrors the Rust `CliError` struct. Tauri serializes `Err(_)` from a
 * `#[tauri::command]` to the JS side as an object, so the promise rejection
 * already arrives as `{ code, message }` — `toCliError()` exists only to
 * normalize unexpected shapes (network/system errors, etc.) into the same
 * type so callers always branch on `code`. Defined locally because it's a
 * Tauri-side concern (not emitted by the CLI itself in this shape).
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

export const listCatalog = (
  frameworkRoot: string,
  catalogFolders?: readonly string[],
  allowBuiltin?: boolean,
): Promise<CatalogReport> => {
  return invoke<CatalogReport>('list_catalog', { frameworkRoot, catalogFolders, allowBuiltin });
};

export const install = (
  frameworkRoot: string,
  projectRoot: string,
  catalogFolders?: readonly string[],
  allowBuiltin?: boolean,
): Promise<InstallReport> => {
  return invoke<InstallReport>('install', {
    frameworkRoot,
    projectRoot,
    catalogFolders,
    allowBuiltin,
  });
};

export type PathDetection = {
  readonly isFramework: boolean;
  readonly isProject: boolean;
};

export const detectPath = (path: string): Promise<PathDetection> => {
  return invoke<PathDetection>('detect_path', { path });
};

export const status = (
  frameworkRoot: string,
  projectRoot: string,
  catalogFolders?: readonly string[],
  allowBuiltin?: boolean,
): Promise<StatusReport> => {
  return invoke<StatusReport>('status', {
    frameworkRoot,
    projectRoot,
    catalogFolders,
    allowBuiltin,
  });
};

export const initialize = (
  frameworkRoot: string,
  projectRoot: string,
  presetName: string,
  catalogFolders?: readonly string[],
  allowBuiltin?: boolean,
): Promise<InitReport> => {
  return invoke<InitReport>('initialize', {
    frameworkRoot,
    projectRoot,
    presetName,
    catalogFolders,
    allowBuiltin,
  });
};

export const ensureGitRepo = (path: string): Promise<void> => {
  return invoke<void>('ensure_git_repo', { path });
};

export const ensureProjectDir = (path: string): Promise<void> => {
  return invoke<void>('ensure_project_dir', { path });
};

/**
 * Asks the engine which catalog presets match the project at `projectRoot`.
 * Returns the matches ordered by descending specificity. The wizard
 * preselects `matches[0]` unless the top two share specificity — see
 * `detect-stack.command.ts` in the CLI for the human-readable mirror.
 *
 * `frameworkRoot` is optional — when omitted the engine falls back to its
 * default catalog resolution (CFW_CATALOG_PATH > built-in once landed). The
 * desktop today still passes its currently-loaded framework root so the
 * detection answers from the same catalog the user sees in the wizard.
 */
export const detectStack = (
  projectRoot: string,
  frameworkRoot?: string,
  catalogFolders?: readonly string[],
  allowBuiltin?: boolean,
): Promise<DetectStackReport> => {
  return invoke<DetectStackReport>('detect_stack', {
    frameworkRoot,
    projectRoot,
    catalogFolders,
    allowBuiltin,
  });
};
