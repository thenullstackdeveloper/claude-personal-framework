import { PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import type { PresetName } from '../../../domain/model/identifiers.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import type {
  CatalogPort,
  GitignoreApplyResult,
  GitignorePort,
  ManifestStorePort,
  ProjectInspectorPort,
} from '../../ports/index.js';
import { INSTALL_OUTPUT_GITIGNORE_ENTRIES } from '../install/install.use-case.js';
import {
  GitignoreBlockConflictError,
  ManifestAlreadyExistsError,
  NotAGitRepoError,
  ProjectDirMissingError,
} from './errors.js';

export type InitProjectInput = {
  readonly presetName: PresetName;
  readonly projectRoot: string;
  readonly catalog: CatalogPort;
  readonly manifestStore: ManifestStorePort;
  readonly inspector: ProjectInspectorPort;
  /**
   * Optional so existing tests that don't exercise the gitignore
   * management keep working unchanged. When provided, init seeds the
   * managed block in the project's `.gitignore`. A `block-conflict` is
   * fatal here (we don't want a half-initialized project) — install,
   * by contrast, treats the same status as a warning.
   */
  readonly gitignore?: GitignorePort;
};

export type InitProjectResult = {
  readonly manifest: ProjectManifest;
  /**
   * Outcome of seeding the managed block in the project's `.gitignore`.
   * `null` when the `gitignore` port was not provided. Real CLI /
   * desktop entrypoints always wire the port.
   */
  readonly gitignore: GitignoreApplyResult | null;
};

/**
 * Creates a project manifest pointing at the given preset.
 *
 * - Refuses to proceed if the project root is not a git working tree.
 *   Hooks need `core.hooksPath` active to fire, and that requires a
 *   repo. The desktop UI catches the typed error and offers to
 *   `git init` for the user.
 * - Refuses to overwrite an existing manifest (no `force` in the MVP —
 *   if the user wants to switch preset, that is a different use case).
 * - Validates that the preset exists in the catalog before writing,
 *   so the resulting manifest is guaranteed to be installable.
 */
export const initProject = async (input: InitProjectInput): Promise<InitProjectResult> => {
  const { presetName, projectRoot, catalog, manifestStore, inspector, gitignore } = input;

  // Probe the project dir BEFORE the git check — a missing folder cannot be
  // a git working tree, and the typed error tells the UI how to recover.
  if (!(await inspector.projectDirExists())) {
    throw new ProjectDirMissingError(projectRoot);
  }

  if (!(await inspector.isGitRepo())) {
    throw new NotAGitRepoError(projectRoot);
  }

  const existing = await manifestStore.read();
  if (existing !== null) {
    throw new ManifestAlreadyExistsError();
  }

  const presets = await catalog.listPresets();
  const exists = presets.some((p) => p.name.equals(presetName));
  if (!exists) {
    throw new PresetNotFoundError(`preset "${presetName.toString()}" not found in catalog`);
  }

  const manifest: ProjectManifest = {
    presetName,
    overrides: [],
  };

  await manifestStore.write(manifest);

  // Seed the managed block in `.gitignore` AFTER writing the manifest
  // (init succeeded if we got here) but BEFORE returning. A
  // `block-conflict` is fatal: we don't want to advertise a successful
  // init while leaving the gitignore in an unrecoverable state.
  let gitignoreResult: GitignoreApplyResult | null = null;
  if (gitignore) {
    gitignoreResult = await gitignore.ensureManagedBlock(INSTALL_OUTPUT_GITIGNORE_ENTRIES);
    if (gitignoreResult.status === 'block-conflict') {
      throw new GitignoreBlockConflictError(gitignoreResult.path);
    }
  }

  return { manifest, gitignore: gitignoreResult };
};
