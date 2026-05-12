export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidSlugError extends DomainError {
  readonly code = 'INVALID_SLUG';
}

export class InvalidContentHashError extends DomainError {
  readonly code = 'INVALID_CONTENT_HASH';
}
