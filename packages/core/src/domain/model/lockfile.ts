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
};

export class Lockfile {
  private constructor(
    public readonly presetName: PresetName,
    public readonly artifacts: readonly LockedArtifact[],
    public readonly settings: Settings,
  ) {}

  static of(init: LockfileInit): Lockfile {
    return new Lockfile(init.presetName, init.artifacts, init.settings);
  }

  findHash(ref: ArtifactRef): ContentHash | null {
    const found = this.artifacts.find(
      (a) => a.ref.type === ref.type && a.ref.id.toString() === ref.id.toString(),
    );
    return found ? found.contentHash : null;
  }
}
