import type { ArtifactRef } from './artifact-ref.js';
import type { ContentHash } from './content-hash.js';

export type DriftUpdate = {
  readonly ref: ArtifactRef;
  readonly oldSha: ContentHash;
  readonly newSha: ContentHash;
};

export type DriftReport = {
  readonly added: readonly ArtifactRef[];
  readonly updated: readonly DriftUpdate[];
  readonly removed: readonly ArtifactRef[];
  readonly unchanged: readonly ArtifactRef[];
};
