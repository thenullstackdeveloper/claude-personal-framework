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

export class PresetNotFoundError extends DomainError {
  readonly code = 'PRESET_NOT_FOUND';
}

export class CyclicExtendsError extends DomainError {
  readonly code = 'CYCLIC_EXTENDS';
}
