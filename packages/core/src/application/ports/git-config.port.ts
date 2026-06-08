/**
 * Read/write port over a single `core.hooksPath` config value of a git
 * repository. Kept separate from `WriterPort` because spawning `git
 * config` is not a filesystem write — preserving the "writer writes
 * files" property keeps `install.use-case` testable with an in-memory
 * fake of this port instead of having to mock subprocesses.
 *
 * Implementations are expected to operate on a single repo (cwd set
 * at construction time).
 */
export interface GitConfigPort {
  /**
   * Returns the current value of `core.hooksPath`, or `null` if it is
   * unset.
   */
  getHooksPath(): Promise<string | null>;

  /**
   * Sets `core.hooksPath` to `path`. Idempotent at the adapter level
   * (re-setting the same value is a no-op for the user). The caller
   * decides whether to overwrite an existing value — this method
   * always writes whatever it is given.
   */
  setHooksPath(path: string): Promise<void>;
}
