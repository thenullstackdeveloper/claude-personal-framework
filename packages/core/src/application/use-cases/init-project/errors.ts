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
