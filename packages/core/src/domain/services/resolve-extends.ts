import { CyclicExtendsError, PresetNotFoundError } from '../errors/domain-error.js';
import type { AgentId, CommandId, PresetName, SkillId } from '../model/identifiers.js';
import { Preset } from '../model/preset.js';
import { Settings } from '../model/settings.js';
import { dedupe } from './dedupe.js';

type Accumulator = {
  agentIds: readonly AgentId[];
  skillIds: readonly SkillId[];
  commandIds: readonly CommandId[];
  settings: Settings;
};

const empty: Accumulator = {
  agentIds: [],
  skillIds: [],
  commandIds: [],
  settings: Settings.empty(),
};

export function resolveExtends(catalog: readonly Preset[], targetName: PresetName): Preset {
  const byName = new Map<string, Preset>();
  for (const preset of catalog) {
    byName.set(preset.name.toString(), preset);
  }

  const visiting = new Set<string>();

  const walk = (name: PresetName): Accumulator => {
    const key = name.toString();
    if (visiting.has(key)) {
      throw new CyclicExtendsError(`cyclic extends detected involving preset "${key}"`);
    }
    const preset = byName.get(key);
    if (!preset) {
      throw new PresetNotFoundError(`preset "${key}" not found in catalog`);
    }
    visiting.add(key);

    let acc = empty;
    for (const parentName of preset.extends_) {
      const parent = walk(parentName);
      acc = {
        agentIds: [...acc.agentIds, ...parent.agentIds],
        skillIds: [...acc.skillIds, ...parent.skillIds],
        commandIds: [...acc.commandIds, ...parent.commandIds],
        settings: acc.settings.merge(parent.settings),
      };
    }

    acc = {
      agentIds: [...acc.agentIds, ...preset.agentIds],
      skillIds: [...acc.skillIds, ...preset.skillIds],
      commandIds: [...acc.commandIds, ...preset.commandIds],
      settings: acc.settings.merge(preset.settings),
    };

    visiting.delete(key);
    return acc;
  };

  const resolved = walk(targetName);

  return Preset.of({
    name: targetName,
    extends_: [],
    agentIds: dedupe(resolved.agentIds),
    skillIds: dedupe(resolved.skillIds),
    commandIds: dedupe(resolved.commandIds),
    settings: resolved.settings,
  });
}
