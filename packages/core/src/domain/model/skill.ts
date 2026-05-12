import { ContentHash } from './content-hash.js';
import type { SkillId } from './identifiers.js';

export class Skill {
  private constructor(
    public readonly id: SkillId,
    public readonly content: string,
    public readonly contentHash: ContentHash,
  ) {}

  static of(id: SkillId, content: string): Skill {
    return new Skill(id, content, ContentHash.of(content));
  }

  equals(other: Skill): boolean {
    return this.id.equals(other.id);
  }
}
