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

export class Settings {
  private constructor(public readonly permissions: Permissions) {}

  static empty(): Settings {
    return new Settings({ allow: [], deny: [] });
  }

  static of(permissions: Partial<Permissions>): Settings {
    return new Settings({
      allow: permissions.allow ?? [],
      deny: permissions.deny ?? [],
    });
  }

  merge(other: Settings): Settings {
    return new Settings({
      allow: dedupe([...this.permissions.allow, ...other.permissions.allow]),
      deny: dedupe([...this.permissions.deny, ...other.permissions.deny]),
    });
  }

  equals(other: Settings): boolean {
    return (
      arraysEqual(this.permissions.allow, other.permissions.allow) &&
      arraysEqual(this.permissions.deny, other.permissions.deny)
    );
  }
}
