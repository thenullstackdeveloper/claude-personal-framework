import type { ArtifactRef } from './artifact-ref.js';
import type { ContentHash } from './content-hash.js';

export type DriftUpdate = {
  readonly ref: ArtifactRef;
  readonly oldSha: ContentHash;
  readonly newSha: ContentHash;
};

/**
 * Outcome for a singleton artifact (Settings, Instructions) — they don't
 * have ids, so `added`/`removed` aren't relative to a `Ref` but to the
 * fact that the artifact appeared or disappeared between installs.
 */
export type SingletonDrift =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'added' }
  | { readonly kind: 'removed'; readonly oldSha: ContentHash }
  | {
      readonly kind: 'updated';
      readonly oldSha: ContentHash;
      readonly newSha: ContentHash;
    };

export type DriftReport = {
  readonly added: readonly ArtifactRef[];
  readonly updated: readonly DriftUpdate[];
  readonly removed: readonly ArtifactRef[];
  readonly unchanged: readonly ArtifactRef[];
  readonly settings: SingletonDrift;
  readonly instructions: SingletonDrift;
};
