/**
 * Events that Claude Code emits hooks against. Subset of what the schema
 * supports — covers the cases that actually appear in user configs today.
 * Add new entries here when a real preset needs them.
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'Notification';

const HOOK_EVENTS_CANONICAL_ORDER: readonly HookEvent[] = [
  'Notification',
  'PostCompact',
  'PostToolUse',
  'PreCompact',
  'PreToolUse',
  'SessionEnd',
  'SessionStart',
  'Stop',
  'SubagentStop',
  'UserPromptSubmit',
];

export type CommandHook = {
  readonly type: 'command';
  readonly command: string;
  readonly timeout?: number;
};

export type HookRule = {
  readonly matcher: string;
  readonly hooks: readonly CommandHook[];
};

const commandHooksEqual = (a: CommandHook, b: CommandHook): boolean => {
  return a.type === b.type && a.command === b.command && a.timeout === b.timeout;
};

const ruleArraysEqual = (a: readonly CommandHook[], b: readonly CommandHook[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!ai || !bi) return false;
    if (!commandHooksEqual(ai, bi)) return false;
  }
  return true;
};

const rulesEqual = (a: HookRule, b: HookRule): boolean => {
  return a.matcher === b.matcher && ruleArraysEqual(a.hooks, b.hooks);
};

const dedupeRules = (rules: readonly HookRule[]): readonly HookRule[] => {
  const out: HookRule[] = [];
  for (const rule of rules) {
    if (!out.some((r) => rulesEqual(r, rule))) {
      out.push(rule);
    }
  }
  return out;
};

const canonicalCommandHook = (h: CommandHook): Record<string, unknown> => {
  const out: Record<string, unknown> = { type: h.type, command: h.command };
  if (h.timeout !== undefined) out['timeout'] = h.timeout;
  return out;
};

const canonicalRule = (r: HookRule): Record<string, unknown> => ({
  matcher: r.matcher,
  hooks: r.hooks.map(canonicalCommandHook),
});

/**
 * Hooks attached to Claude Code events. Modeled as a map of event ->
 * ordered rules. The map's ordering is irrelevant to identity — equality
 * and canonical serialization both compare by content with sorted keys.
 *
 * `merge(other)` concatenates `other`'s rules **after** the current ones
 * within each event and deduplicates structurally (same matcher + same
 * command hooks → one entry). This means parent presets contribute first
 * and child presets append; identical hooks declared by both don't pile
 * up in the chain.
 */
export class Hooks {
  private constructor(private readonly rules: ReadonlyMap<HookEvent, readonly HookRule[]>) {}

  static empty(): Hooks {
    return new Hooks(new Map());
  }

  static of(entries: Partial<Record<HookEvent, readonly HookRule[]>>): Hooks {
    const map = new Map<HookEvent, readonly HookRule[]>();
    for (const event of HOOK_EVENTS_CANONICAL_ORDER) {
      const rules = entries[event];
      if (rules && rules.length > 0) {
        map.set(event, dedupeRules(rules));
      }
    }
    return new Hooks(map);
  }

  get(event: HookEvent): readonly HookRule[] {
    return this.rules.get(event) ?? [];
  }

  events(): readonly HookEvent[] {
    return HOOK_EVENTS_CANONICAL_ORDER.filter((e) => this.rules.has(e));
  }

  isEmpty(): boolean {
    for (const rules of this.rules.values()) {
      if (rules.length > 0) return false;
    }
    return true;
  }

  merge(other: Hooks): Hooks {
    const result = new Map<HookEvent, readonly HookRule[]>();
    const allEvents = new Set<HookEvent>([...this.rules.keys(), ...other.rules.keys()]);
    for (const event of HOOK_EVENTS_CANONICAL_ORDER) {
      if (!allEvents.has(event)) continue;
      const combined = [...this.get(event), ...other.get(event)];
      const deduped = dedupeRules(combined);
      if (deduped.length > 0) {
        result.set(event, deduped);
      }
    }
    return new Hooks(result);
  }

  equals(other: Hooks): boolean {
    return this.toCanonicalJSON() === other.toCanonicalJSON();
  }

  /**
   * Stable, byte-comparable JSON representation. Used both for content
   * hashing (see {@link Settings.contentHash}) and for writing the JSON
   * payload to disk; the adapter does not need a separate serializer.
   */
  toCanonicalJSON(): string {
    const obj: Record<string, unknown> = {};
    for (const event of HOOK_EVENTS_CANONICAL_ORDER) {
      const rules = this.rules.get(event);
      if (rules && rules.length > 0) {
        obj[event] = rules.map(canonicalRule);
      }
    }
    return JSON.stringify(obj);
  }

  /**
   * The same data the canonical JSON encodes, but as a JS object — handy
   * for adapters that need to build a larger JSON wrapping it (e.g. the
   * full `.claude/settings.json`).
   */
  toObject(): Record<HookEvent, readonly HookRule[]> {
    const obj = {} as Record<HookEvent, readonly HookRule[]>;
    for (const event of HOOK_EVENTS_CANONICAL_ORDER) {
      const rules = this.rules.get(event);
      if (rules && rules.length > 0) obj[event] = rules;
    }
    return obj;
  }
}
