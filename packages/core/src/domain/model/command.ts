import { ContentHash } from './content-hash.js';
import type { CommandId } from './identifiers.js';

export class Command {
  private constructor(
    public readonly id: CommandId,
    public readonly content: string,
    public readonly contentHash: ContentHash,
  ) {}

  static of(id: CommandId, content: string): Command {
    return new Command(id, content, ContentHash.of(content));
  }

  equals(other: Command): boolean {
    return this.id.equals(other.id);
  }
}
