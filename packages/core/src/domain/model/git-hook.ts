import { ContentHash } from './content-hash.js';
import type { HookName } from './identifiers.js';

export class GitHook {
  private constructor(
    public readonly hookName: HookName,
    public readonly content: string,
    public readonly contentHash: ContentHash,
  ) {}

  static of(hookName: HookName, content: string): GitHook {
    return new GitHook(hookName, content, ContentHash.of(content));
  }

  equals(other: GitHook): boolean {
    return this.hookName === other.hookName;
  }
}
