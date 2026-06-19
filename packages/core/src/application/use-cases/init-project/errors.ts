/**
 * Raised by `initProject` when the project already has a manifest
 * and overwrite is not allowed. Co-located with the use case because
 * this is a flow rule (init refuses to clobber), not a domain rule.
 */
export class ManifestAlreadyExistsError extends Error {
  readonly code = 'MANIFEST_ALREADY_EXISTS';

  constructor(message = 'a project manifest already exists') {
    super(message);
    this.name = 'ManifestAlreadyExistsError';
  }
}

/**
 * Raised by `initProject` when the chosen project directory is not a
 * git working tree. Flow rule (init wants the project to be ready for
 * hooks activation downstream); the desktop UI catches this code and
 * offers the user a `git init` prompt, while the CLI surfaces the
 * error verbatim or auto-resolves it via the `--init-git` flag.
 */
export class NotAGitRepoError extends Error {
  readonly code = 'NOT_A_GIT_REPO';
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    super(`the folder at "${projectRoot}" is not a git repository`);
    this.name = 'NotAGitRepoError';
    this.projectRoot = projectRoot;
  }
}

/**
 * Raised by `initProject` and `install` when the project root path does
 * not exist on disk. Distinguishes "wrong / mistyped path" from "no
 * manifest yet" — without this, a missing folder surfaces as a raw
 * `ENOENT` from the next disk op, which the UI cannot react to. The
 * desktop catches this code and offers to `mkdir -p`; the CLI surfaces
 * it verbatim or auto-resolves with the `--create-dir` flag.
 */
export class ProjectDirMissingError extends Error {
  readonly code = 'PROJECT_DIR_MISSING';
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    super(`the folder at "${projectRoot}" does not exist`);
    this.name = 'ProjectDirMissingError';
    this.projectRoot = projectRoot;
  }
}

/**
 * Raised by `initProject` when the target project's `.gitignore`
 * already contains more than one pair of `claude-fw managed` markers.
 * Two managed blocks mean we can't safely decide which one to update
 * without clobbering user state — refuse and let them fix it manually.
 *
 * `install` does NOT throw on this; it surfaces `block-conflict` in the
 * report and proceeds with materialization (which is the user-facing
 * value) so a corrupted gitignore doesn't block work that has nothing
 * to do with it.
 */
export class GitignoreBlockConflictError extends Error {
  readonly code = 'GITIGNORE_BLOCK_CONFLICT';
  readonly path: string;

  constructor(path: string) {
    super(
      `the .gitignore at "${path}" contains more than one claude-fw managed block; remove one before re-running init`,
    );
    this.name = 'GitignoreBlockConflictError';
    this.path = path;
  }
}
