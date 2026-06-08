import type { HookName } from '../../domain/model/identifiers.js';

/**
 * Read-side port for inspecting the project on disk. Kept separate from
 * `WriterPort` so that pure queries don't drag in a writer dependency —
 * a use case that only needs to peek (e.g. take-over detection) does
 * not need the authority to mutate anything.
 */
export interface ProjectInspectorPort {
  /**
   * True if `.claude/CLAUDE.md` exists in the project. Used by `install`
   * to detect a user-authored CLAUDE.md that the lockfile doesn't yet
   * manage, so it can refuse to overwrite it.
   */
  claudeMdExists(): Promise<boolean>;

  /**
   * True if `.githooks/<hookName>` exists in the project. Same purpose
   * as {@link claudeMdExists} but for git hooks: detect a user-authored
   * hook the lockfile doesn't manage so install can refuse to overwrite
   * it.
   */
  gitHookExists(hookName: HookName): Promise<boolean>;
}
