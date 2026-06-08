import type { ArtifactRef } from './artifact-ref.js';
import type { ContentHash } from './content-hash.js';
import type { HookName, PresetName } from './identifiers.js';
import type { Instructions } from './instructions.js';
import type { Settings } from './settings.js';

export const LOCKFILE_VERSION = 1;

export type LockedArtifact = {
  readonly ref: ArtifactRef;
  readonly contentHash: ContentHash;
};

export type LockedGitHook = {
  readonly hookName: HookName;
  readonly contentHash: ContentHash;
};

export type LockfileInit = {
  readonly presetName: PresetName;
  readonly artifacts: readonly LockedArtifact[];
  readonly settings: Settings;
  /**
   * Hash of the settings canonical JSON. Persisted explicitly so adapters
   * can verify drift without re-serializing (and so the lockfile is
   * inspectable by humans). If omitted at construction, the lockfile
   * computes it from the provided settings.
   */
  readonly settingsHash?: ContentHash;
  readonly instructions: Instructions;
  /**
   * Hash of the instructions content. Persisted for the same reasons as
   * `settingsHash`. If omitted, computed from the provided instructions.
   */
  readonly instructionsHash?: ContentHash;
  /**
   * Git hooks live in their own section, separate from `artifacts`,
   * because their target directory is `.githooks/` (outside `.claude/`)
   * and because keeping the JSON section explicit makes the lockfile
   * readable. Optional for back-compat with lockfiles written before
   * git-hooks landed.
   */
  readonly gitHooks?: readonly LockedGitHook[];
};

export class Lockfile {
  private constructor(
    public readonly presetName: PresetName,
    public readonly artifacts: readonly LockedArtifact[],
    public readonly settings: Settings,
    public readonly settingsHash: ContentHash,
    public readonly instructions: Instructions,
    public readonly instructionsHash: ContentHash,
    public readonly gitHooks: readonly LockedGitHook[],
  ) {}

  static of(init: LockfileInit): Lockfile {
    const settingsHash = init.settingsHash ?? init.settings.contentHash();
    const instructionsHash = init.instructionsHash ?? init.instructions.contentHash();
    return new Lockfile(
      init.presetName,
      init.artifacts,
      init.settings,
      settingsHash,
      init.instructions,
      instructionsHash,
      init.gitHooks ?? [],
    );
  }

  findHash(ref: ArtifactRef): ContentHash | null {
    if (ref.type === 'git-hook') return this.findGitHookHash(ref.hookName);
    const found = this.artifacts.find((a) => {
      if (a.ref.type === 'git-hook') return false;
      return a.ref.type === ref.type && a.ref.id.toString() === ref.id.toString();
    });
    return found ? found.contentHash : null;
  }

  findGitHookHash(hookName: HookName): ContentHash | null {
    const found = this.gitHooks.find((h) => h.hookName === hookName);
    return found ? found.contentHash : null;
  }
}
