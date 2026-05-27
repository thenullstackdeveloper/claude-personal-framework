import { InvalidSlugError } from '../errors/domain-error.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

abstract class Slug {
  protected constructor(protected readonly value: string) {}

  protected static parse(raw: string, kind: string): string {
    if (!raw) {
      throw new InvalidSlugError(`${kind} cannot be empty`);
    }
    if (!SLUG_PATTERN.test(raw)) {
      throw new InvalidSlugError(
        `${kind} must be kebab-case (lowercase, digits, hyphens, starting with a letter), got "${raw}"`,
      );
    }
    return raw;
  }

  toString(): string {
    return this.value;
  }
}

export class AgentId extends Slug {
  static of(raw: string): AgentId {
    return new AgentId(Slug.parse(raw, 'AgentId'));
  }

  equals(other: AgentId): boolean {
    return this.value === other.value;
  }
}

export class SkillId extends Slug {
  static of(raw: string): SkillId {
    return new SkillId(Slug.parse(raw, 'SkillId'));
  }

  equals(other: SkillId): boolean {
    return this.value === other.value;
  }
}

export class CommandId extends Slug {
  static of(raw: string): CommandId {
    return new CommandId(Slug.parse(raw, 'CommandId'));
  }

  equals(other: CommandId): boolean {
    return this.value === other.value;
  }
}

export class PresetName extends Slug {
  static of(raw: string): PresetName {
    return new PresetName(Slug.parse(raw, 'PresetName'));
  }

  equals(other: PresetName): boolean {
    return this.value === other.value;
  }
}

export class InstructionsId extends Slug {
  static of(raw: string): InstructionsId {
    return new InstructionsId(Slug.parse(raw, 'InstructionsId'));
  }

  equals(other: InstructionsId): boolean {
    return this.value === other.value;
  }
}
