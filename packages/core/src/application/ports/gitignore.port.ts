import type { GitignoreBlockStatus } from '../../domain/services/gitignore-block.js';

/**
 * Result of attempting to maintain the managed block in a project's
 * `.gitignore`. `path` is the absolute path that was inspected (after
 * resolving any symlink at the project root).
 *
 * Status semantics:
 * - `created`: file was missing and has been written from scratch.
 * - `updated`: file existed and the managed block has been added or
 *   replaced.
 * - `unchanged`: file existed and already carried the exact block;
 *   no write took place.
 * - `block-conflict`: more than one pair of markers (or unbalanced
 *   markers) was detected; the adapter refused to write and the file
 *   is untouched. Use cases decide whether this is fatal (e.g. `init`)
 *   or a warning surfaced in the report (e.g. `install`).
 */
export interface GitignoreApplyResult {
  readonly status: GitignoreBlockStatus;
  readonly path: string;
}

export interface GitignorePort {
  /**
   * Ensures the project root's `.gitignore` contains exactly one managed
   * block listing the given entries. Idempotent.
   */
  ensureManagedBlock(entries: readonly string[]): Promise<GitignoreApplyResult>;
}
