import { ContentHash } from './content-hash.js';

const SEPARATOR = '\n\n';

/**
 * Singleton value object for the project-level Claude Code instructions
 * (`.claude/CLAUDE.md`). Constructed by concatenating one or more catalog
 * `instructions/<id>.md` files in the order resolved from a preset's
 * extends chain.
 *
 * Composition is via `append` only — no `merge`. The separator (`\n\n`)
 * is owned by the VO, so any reduction with `Instructions.empty()` as
 * seed produces the canonical concatenated form.
 */
export class Instructions {
  private constructor(public readonly content: string) {}

  static empty(): Instructions {
    return new Instructions('');
  }

  static of(content: string): Instructions {
    return new Instructions(content);
  }

  isEmpty(): boolean {
    return this.content.length === 0;
  }

  append(other: Instructions): Instructions {
    if (this.isEmpty()) return other;
    if (other.isEmpty()) return this;
    return new Instructions(this.content + SEPARATOR + other.content);
  }

  equals(other: Instructions): boolean {
    return this.content === other.content;
  }

  contentHash(): ContentHash {
    return ContentHash.of(this.content);
  }
}
