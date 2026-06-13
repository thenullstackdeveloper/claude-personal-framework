import { parse as parseYaml } from 'yaml';
import { InvalidHookNameError, InvalidPresetError } from '../../domain/errors/domain-error.js';
import type { DetectRule } from '../../domain/model/detect-rule.js';
import {
  type CommandHook,
  type HookEvent,
  type HookRule,
  Hooks,
} from '../../domain/model/hooks.js';
import {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  PresetName,
  SkillId,
} from '../../domain/model/identifiers.js';
import { Preset } from '../../domain/model/preset.js';
import { Settings } from '../../domain/model/settings.js';
import { asStringOrArray, isObject, isStringArray } from './yaml-helpers.js';

const KNOWN_HOOK_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
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

const parseIdArray = <T>(
  raw: unknown,
  factory: (s: string) => T,
  presetName: string,
  field: string,
): readonly T[] => {
  if (raw === undefined) return [];
  if (!isStringArray(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "${field}" must be a list of strings`);
  }
  return raw.map(factory);
};

const parseStringArray = (raw: unknown, presetName: string, field: string): readonly string[] => {
  if (raw === undefined) return [];
  if (!isStringArray(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "${field}" must be a list of strings`);
  }
  return raw;
};

const parseCommandHook = (raw: unknown, presetName: string, path: string): CommandHook => {
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "${path}" must be a map`);
  }
  if (raw['type'] !== 'command') {
    throw new InvalidPresetError(
      `preset "${presetName}": "${path}.type" must be "command" (got ${JSON.stringify(raw['type'])})`,
    );
  }
  const command = raw['command'];
  if (typeof command !== 'string' || command.length === 0) {
    throw new InvalidPresetError(
      `preset "${presetName}": "${path}.command" must be a non-empty string`,
    );
  }
  const timeoutRaw = raw['timeout'];
  if (timeoutRaw !== undefined && typeof timeoutRaw !== 'number') {
    throw new InvalidPresetError(`preset "${presetName}": "${path}.timeout" must be a number`);
  }
  return timeoutRaw === undefined
    ? { type: 'command', command }
    : { type: 'command', command, timeout: timeoutRaw };
};

const parseHookRule = (raw: unknown, presetName: string, path: string): HookRule => {
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "${path}" must be a map`);
  }
  const matcher = raw['matcher'];
  if (matcher !== undefined && typeof matcher !== 'string') {
    throw new InvalidPresetError(`preset "${presetName}": "${path}.matcher" must be a string`);
  }
  const hooksRaw = raw['hooks'];
  if (!Array.isArray(hooksRaw)) {
    throw new InvalidPresetError(`preset "${presetName}": "${path}.hooks" must be a list`);
  }
  const hooks = hooksRaw.map((h, i) => parseCommandHook(h, presetName, `${path}.hooks[${i}]`));
  return { matcher: matcher ?? '', hooks };
};

const parseHooks = (raw: unknown, presetName: string): Hooks => {
  if (raw === undefined) return Hooks.empty();
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "settings.hooks" must be a map`);
  }
  const entries: Partial<Record<HookEvent, readonly HookRule[]>> = {};
  for (const [event, value] of Object.entries(raw)) {
    if (!KNOWN_HOOK_EVENTS.has(event as HookEvent)) {
      throw new InvalidPresetError(
        `preset "${presetName}": unknown hook event "${event}" in "settings.hooks"`,
      );
    }
    if (!Array.isArray(value)) {
      throw new InvalidPresetError(
        `preset "${presetName}": "settings.hooks.${event}" must be a list of rules`,
      );
    }
    entries[event as HookEvent] = value.map((rule, i) =>
      parseHookRule(rule, presetName, `settings.hooks.${event}[${i}]`),
    );
  }
  return Hooks.of(entries);
};

const parseSettings = (raw: unknown, presetName: string): Settings => {
  if (raw === undefined) return Settings.empty();
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "settings" must be a map`);
  }
  const perms = raw['permissions'];
  let allow: readonly string[] = [];
  let deny: readonly string[] = [];
  if (perms !== undefined) {
    if (!isObject(perms)) {
      throw new InvalidPresetError(`preset "${presetName}": "settings.permissions" must be a map`);
    }
    allow = parseStringArray(perms['allow'], presetName, 'settings.permissions.allow');
    deny = parseStringArray(perms['deny'], presetName, 'settings.permissions.deny');
  }
  const hooks = parseHooks(raw['hooks'], presetName);
  return Settings.of({ permissions: { allow, deny }, hooks });
};

export const parsePreset = (yamlText: string, name: string): Preset => {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new InvalidPresetError(
      `preset "${name}": failed to parse YAML — ${(err as Error).message}`,
    );
  }

  const presetName = PresetName.of(name);

  if (raw === null || raw === undefined) {
    return Preset.of({ name: presetName });
  }
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${name}": YAML root must be a map`);
  }

  let extends_: readonly PresetName[] = [];
  if (raw['extends'] !== undefined) {
    const value = asStringOrArray(raw['extends']);
    if (!value) {
      throw new InvalidPresetError(
        `preset "${name}": "extends" must be a string or list of strings`,
      );
    }
    extends_ = value.map((s) => PresetName.of(s));
  }

  const instructionsRaw = raw['instructions'];
  let instructionsIds: readonly InstructionsId[] = [];
  if (instructionsRaw !== undefined) {
    if (typeof instructionsRaw !== 'string') {
      throw new InvalidPresetError(
        `preset "${name}": "instructions" must be a single id string (got ${JSON.stringify(
          instructionsRaw,
        )})`,
      );
    }
    instructionsIds = [InstructionsId.of(instructionsRaw)];
  }

  const gitHookNames = parseGitHookNames(raw['git-hooks'], name);
  const detects = parseDetects(raw['detects'], name);

  return Preset.of({
    name: presetName,
    extends_,
    agentIds: parseIdArray(raw['agents'], AgentId.of, name, 'agents'),
    skillIds: parseIdArray(raw['skills'], SkillId.of, name, 'skills'),
    commandIds: parseIdArray(raw['commands'], CommandId.of, name, 'commands'),
    instructionsIds,
    gitHookNames,
    settings: parseSettings(raw['settings'], name),
    detects,
  });
};

const parseDetects = (raw: unknown, presetName: string): readonly DetectRule[] => {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "detects" must be a list of rules`);
  }
  return raw.map((entry, i) => parseDetectRule(entry, presetName, i));
};

const parseDetectRule = (raw: unknown, presetName: string, index: number): DetectRule => {
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "detects[${index}]" must be a map`);
  }
  const rule: { -readonly [K in keyof DetectRule]: DetectRule[K] } = {};
  if (raw['dependencies'] !== undefined) {
    rule.dependencies = parseStringArray(
      raw['dependencies'],
      presetName,
      `detects[${index}].dependencies`,
    );
  }
  if (raw['files'] !== undefined) {
    rule.files = parseStringArray(raw['files'], presetName, `detects[${index}].files`);
  }
  return rule;
};

const parseGitHookNames = (raw: unknown, presetName: string): readonly HookName[] => {
  if (raw === undefined) return [];
  if (!isStringArray(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "git-hooks" must be a list of strings`);
  }
  return raw.map((value) => {
    try {
      return HookName.of(value);
    } catch (err) {
      if (err instanceof InvalidHookNameError) {
        throw new InvalidPresetError(
          `preset "${presetName}": "git-hooks" entry "${value}" is not a supported hook name (expected one of: ${HookName.values.join(', ')})`,
        );
      }
      throw err;
    }
  });
};
