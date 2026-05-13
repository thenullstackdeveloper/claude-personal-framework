import { parse as parseYaml } from 'yaml';
import { InvalidPresetError } from '../../domain/errors/domain-error.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { Preset } from '../../domain/model/preset.js';
import { Settings } from '../../domain/model/settings.js';
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

const parseSettings = (raw: unknown, presetName: string): Settings => {
  if (raw === undefined) return Settings.empty();
  if (!isObject(raw)) {
    throw new InvalidPresetError(`preset "${presetName}": "settings" must be a map`);
  }
  const perms = raw['permissions'];
  if (perms === undefined) return Settings.empty();
  if (!isObject(perms)) {
    throw new InvalidPresetError(`preset "${presetName}": "settings.permissions" must be a map`);
  }
  const allow = parseStringArray(perms['allow'], presetName, 'settings.permissions.allow');
  const deny = parseStringArray(perms['deny'], presetName, 'settings.permissions.deny');
  return Settings.of({ allow, deny });
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

  return Preset.of({
    name: presetName,
    extends_,
    agentIds: parseIdArray(raw['agents'], AgentId.of, name, 'agents'),
    skillIds: parseIdArray(raw['skills'], SkillId.of, name, 'skills'),
    commandIds: parseIdArray(raw['commands'], CommandId.of, name, 'commands'),
    settings: parseSettings(raw['settings'], name),
  });
};
