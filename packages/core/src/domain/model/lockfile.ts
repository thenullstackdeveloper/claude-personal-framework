import type { ArtifactRef } from './artifact-ref.js';
import type { ContentHash } from './content-hash.js';
import type { PresetName } from './identifiers.js';
import type { Instructions } from './instructions.js';
import type { Settings } from './settings.js';

export const LOCKFILE_VERSION = 1;

export type LockedArtifact = {
  readonly ref: ArtifactRef;
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
};

export class Lockfile {
  private constructor(
    public readonly presetName: PresetName,
    public readonly artifacts: readonly LockedArtifact[],
    public readonly settings: Settings,
    public readonly settingsHash: ContentHash,
    public readonly instructions: Instructions,
    public readonly instructionsHash: ContentHash,
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
    );
  }

  findHash(ref: ArtifactRef): ContentHash | null {
    // git-hook refs are not tracked in the artifacts section in this sub-phase;
    // they will get their own section in a later sub-phase.
    if (ref.type === 'git-hook') return null;
    const found = this.artifacts.find((a) => {
      if (a.ref.type === 'git-hook') return false;
      return a.ref.type === ref.type && a.ref.id.toString() === ref.id.toString();
    });
    return found ? found.contentHash : null;
  }
}
