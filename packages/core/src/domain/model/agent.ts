import { ContentHash } from './content-hash.js';
import type { AgentId } from './identifiers.js';

export class Agent {
  private constructor(
    public readonly id: AgentId,
    public readonly content: string,
    public readonly contentHash: ContentHash,
  ) {}

  static of(id: AgentId, content: string): Agent {
    return new Agent(id, content, ContentHash.of(content));
  }

  equals(other: Agent): boolean {
    return this.id.equals(other.id);
  }
}
