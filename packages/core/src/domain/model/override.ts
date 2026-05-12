import type { ArtifactRef } from './artifact-ref.js';

export type Override =
  | { readonly kind: 'disable'; readonly target: ArtifactRef }
  | { readonly kind: 'patch'; readonly target: ArtifactRef; readonly content: string }
  | { readonly kind: 'add'; readonly target: ArtifactRef };

export const Override = {
  disable: (target: ArtifactRef): Override => ({ kind: 'disable', target }),

  patch: (target: ArtifactRef, content: string): Override => ({
    kind: 'patch',
    target,
    content,
  }),

  add: (target: ArtifactRef): Override => ({ kind: 'add', target }),
} as const;
