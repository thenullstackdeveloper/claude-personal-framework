import type { ArtifactRef } from './artifact-ref.js';
import type { ContentHash } from './content-hash.js';
import type { PresetName } from './identifiers.js';
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
};

export class Lockfile {
  private constructor(
    public readonly presetName: PresetName,
    public readonly artifacts: readonly LockedArtifact[],
    public readonly settings: Settings,
    public readonly settingsHash: ContentHash,
  ) {}

  static of(init: LockfileInit): Lockfile {
    const settingsHash = init.settingsHash ?? init.settings.contentHash();
    return new Lockfile(init.presetName, init.artifacts, init.settings, settingsHash);
  }

  findHash(ref: ArtifactRef): ContentHash | null {
    const found = this.artifacts.find(
      (a) => a.ref.type === ref.type && a.ref.id.toString() === ref.id.toString(),
    );
    return found ? found.contentHash : null;
  }
}
