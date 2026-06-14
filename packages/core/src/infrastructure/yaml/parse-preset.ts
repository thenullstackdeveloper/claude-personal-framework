import { parse as parseYaml } from 'yaml';
import { InvalidHookNameError, InvalidPresetError } from '../../domain/errors/domain-error.js';
import type { DetectRule } from '../../domain/model/detect-rule.js';
import {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  PresetName,
  SkillId,
} from '../../domain/model/identifiers.js';
import { Preset } from '../../domain/model/preset.js';
import { createSettingsParser } from '../_shared/settings-parsing.js';
import { asStringOrArray, isObject, isStringArray } from './yaml-helpers.js';

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

const parseSettingsFor = (presetName: string) =>
  createSettingsParser({
    errorFactory: (msg) => new InvalidPresetError(msg),
    fieldPrefix: `preset "${presetName}": `,
  });

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
    settings: parseSettingsFor(name)(raw['settings']),
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
