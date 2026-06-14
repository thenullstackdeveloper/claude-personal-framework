import {
  type CommandHook,
  type HookEvent,
  type HookRule,
  Hooks,
} from '../../domain/model/hooks.js';
import { Settings } from '../../domain/model/settings.js';
import { isObject, isStringArray } from './object-guards.js';

/**
 * Closed list of hook events. Kept here so the YAML preset parser and the
 * JSON lockfile parser stay in lock-step without each one repeating the
 * enumeration (CLAUDEPERS-31).
 */
export const KNOWN_HOOK_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'Notification',
]);

/**
 * Adapter-specific context for {@link createSettingsParser}. Lets the YAML
 * preset parser report errors with a `preset "X": …` prefix and
 * `InvalidPresetError`, while the JSON lockfile parser uses
 * `InvalidLockfileError` with no prefix. Keeps the parsing identical and
 * the diagnostics adapter-shaped.
 */
export type SettingsParseContext = {
  /** Builds the actual Error to throw. Encodes the adapter's error type. */
  readonly errorFactory: (message: string) => Error;
  /** Prepended to every error message verbatim. `""` for "no prefix". */
  readonly fieldPrefix: string;
};

/**
 * Returns a `parseSettings(raw): Settings` bound to the given context.
 * Mirrors the previous behaviour of each adapter byte-for-byte except that
 * "map" was unified to "object" in error messages — no test asserted the
 * old wording.
 */
export const createSettingsParser = (ctx: SettingsParseContext): ((raw: unknown) => Settings) => {
  const err = (message: string): Error => ctx.errorFactory(`${ctx.fieldPrefix}${message}`);

  const parseCommandHook = (raw: unknown, path: string): CommandHook => {
    if (!isObject(raw)) throw err(`"${path}" must be an object`);
    if (raw['type'] !== 'command') {
      throw err(`"${path}.type" must be "command" (got ${JSON.stringify(raw['type'])})`);
    }
    const command = raw['command'];
    if (typeof command !== 'string' || command.length === 0) {
      throw err(`"${path}.command" must be a non-empty string`);
    }
    const timeoutRaw = raw['timeout'];
    if (timeoutRaw !== undefined && typeof timeoutRaw !== 'number') {
      throw err(`"${path}.timeout" must be a number`);
    }
    return timeoutRaw === undefined
      ? { type: 'command', command }
      : { type: 'command', command, timeout: timeoutRaw };
  };

  const parseHookRule = (raw: unknown, path: string): HookRule => {
    if (!isObject(raw)) throw err(`"${path}" must be an object`);
    const matcher = raw['matcher'];
    if (matcher !== undefined && typeof matcher !== 'string') {
      throw err(`"${path}.matcher" must be a string`);
    }
    const hooksRaw = raw['hooks'];
    if (!Array.isArray(hooksRaw)) {
      throw err(`"${path}.hooks" must be a list`);
    }
    const hooks = hooksRaw.map((h, i) => parseCommandHook(h, `${path}.hooks[${i}]`));
    return { matcher: matcher ?? '', hooks };
  };

  const parseHooks = (raw: unknown): Hooks => {
    if (raw === undefined) return Hooks.empty();
    if (!isObject(raw)) throw err('"settings.hooks" must be an object');
    const entries: Partial<Record<HookEvent, readonly HookRule[]>> = {};
    for (const [event, value] of Object.entries(raw)) {
      if (!KNOWN_HOOK_EVENTS.has(event as HookEvent)) {
        throw err(`unknown hook event "${event}" in "settings.hooks"`);
      }
      if (!Array.isArray(value)) {
        throw err(`"settings.hooks.${event}" must be a list of rules`);
      }
      entries[event as HookEvent] = value.map((rule, i) =>
        parseHookRule(rule, `settings.hooks.${event}[${i}]`),
      );
    }
    return Hooks.of(entries);
  };

  return (raw: unknown): Settings => {
    if (raw === undefined) return Settings.empty();
    if (!isObject(raw)) throw err('"settings" must be an object');
    let allow: readonly string[] = [];
    let deny: readonly string[] = [];
    const perms = raw['permissions'];
    if (perms !== undefined) {
      if (!isObject(perms)) throw err('"settings.permissions" must be an object');
      const allowRaw = perms['allow'];
      const denyRaw = perms['deny'];
      if (allowRaw !== undefined && !isStringArray(allowRaw)) {
        throw err('"settings.permissions.allow" must be a list of strings');
      }
      if (denyRaw !== undefined && !isStringArray(denyRaw)) {
        throw err('"settings.permissions.deny" must be a list of strings');
      }
      if (allowRaw) allow = allowRaw;
      if (denyRaw) deny = denyRaw;
    }
    return Settings.of({ permissions: { allow, deny }, hooks: parseHooks(raw['hooks']) });
  };
};
