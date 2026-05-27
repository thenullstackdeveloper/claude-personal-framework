/**
 * Raised by `install` when `.claude/CLAUDE.md` already exists in the
 * project but the lockfile does not record it as managed. Co-located
 * with the use case because this is a flow rule (install refuses to
 * clobber a user-authored CLAUDE.md), not a domain rule.
 */
export class UnmanagedClaudeMdError extends Error {
  readonly code = 'UNMANAGED_CLAUDE_MD';

  constructor(
    message = '.claude/CLAUDE.md exists but is not managed by this framework. Move or delete it to let the framework take over.',
  ) {
    super(message);
    this.name = 'UnmanagedClaudeMdError';
  }
}
