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
