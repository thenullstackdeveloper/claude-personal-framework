import { ContentHash } from './content-hash.js';
import { Hooks } from './hooks.js';

export type Permissions = {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
};

const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const dedupe = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
};

export type SettingsInit = {
  readonly permissions?: Partial<Permissions>;
  readonly hooks?: Hooks;
};

/**
 * Container value object for the project-level Claude Code settings:
 * permission rules and event hooks. The domain owns the rules for
 * merging and the canonical representation that drives content hashing
 * and drift detection — adapters only serialize/parse the JSON shape.
 */
export class Settings {
  private constructor(
    public readonly permissions: Permissions,
    public readonly hooks: Hooks,
  ) {}

  static empty(): Settings {
    return new Settings({ allow: [], deny: [] }, Hooks.empty());
  }

  static of(init: SettingsInit | Partial<Permissions>): Settings {
    // Back-compat: callers that used `Settings.of({ allow, deny })` still work.
    const isWrapped = 'permissions' in init || 'hooks' in init;
    const permissions: Partial<Permissions> = isWrapped
      ? ((init as SettingsInit).permissions ?? {})
      : (init as Partial<Permissions>);
    const hooks = isWrapped ? ((init as SettingsInit).hooks ?? Hooks.empty()) : Hooks.empty();
    return new Settings(
      {
        allow: permissions.allow ?? [],
        deny: permissions.deny ?? [],
      },
      hooks,
    );
  }

  isEmpty(): boolean {
    return (
      this.permissions.allow.length === 0 &&
      this.permissions.deny.length === 0 &&
      this.hooks.isEmpty()
    );
  }

  merge(other: Settings): Settings {
    return new Settings(
      {
        allow: dedupe([...this.permissions.allow, ...other.permissions.allow]),
        deny: dedupe([...this.permissions.deny, ...other.permissions.deny]),
      },
      this.hooks.merge(other.hooks),
    );
  }

  equals(other: Settings): boolean {
    return (
      arraysEqual(this.permissions.allow, other.permissions.allow) &&
      arraysEqual(this.permissions.deny, other.permissions.deny) &&
      this.hooks.equals(other.hooks)
    );
  }

  /**
   * Stable JSON for hashing and serialization. Keys are emitted in a
   * fixed order; arrays preserve insertion order (deduped at merge time).
   * Two equal `Settings` always produce identical strings.
   */
  toCanonicalJSON(): string {
    const obj: Record<string, unknown> = {};
    if (this.permissions.allow.length > 0 || this.permissions.deny.length > 0) {
      obj['permissions'] = {
        allow: [...this.permissions.allow],
        deny: [...this.permissions.deny],
      };
    }
    if (!this.hooks.isEmpty()) {
      obj['hooks'] = this.hooks.toObject();
    }
    return JSON.stringify(obj);
  }

  contentHash(): ContentHash {
    return ContentHash.of(this.toCanonicalJSON());
  }
}
