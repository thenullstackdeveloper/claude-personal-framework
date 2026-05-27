import type { ArtifactRef } from '../model/artifact-ref.js';
import type { AgentId, CommandId, SkillId } from '../model/identifiers.js';
import type { Override } from '../model/override.js';
import { Preset } from '../model/preset.js';
import { dedupe } from './dedupe.js';

export type Patch = {
  readonly target: ArtifactRef;
  readonly content: string;
};

export type ApplyOverridesResult = {
  readonly preset: Preset;
  readonly patches: readonly Patch[];
};

export function applyOverrides(
  preset: Preset,
  overrides: readonly Override[],
): ApplyOverridesResult {
  let agentIds: readonly AgentId[] = preset.agentIds;
  let skillIds: readonly SkillId[] = preset.skillIds;
  let commandIds: readonly CommandId[] = preset.commandIds;
  const patches: Patch[] = [];

  for (const override of overrides) {
    if (override.kind === 'disable') {
      const target = override.target;
      if (target.type === 'agent') {
        const id = target.id;
        agentIds = agentIds.filter((x) => !x.equals(id));
      } else if (target.type === 'skill') {
        const id = target.id;
        skillIds = skillIds.filter((x) => !x.equals(id));
      } else {
        const id = target.id;
        commandIds = commandIds.filter((x) => !x.equals(id));
      }
      continue;
    }

    if (override.kind === 'add') {
      const target = override.target;
      if (target.type === 'agent') {
        agentIds = dedupe([...agentIds, target.id]);
      } else if (target.type === 'skill') {
        skillIds = dedupe([...skillIds, target.id]);
      } else {
        commandIds = dedupe([...commandIds, target.id]);
      }
      continue;
    }

    if (override.kind === 'patch') {
      patches.push({ target: override.target, content: override.content });
    }
  }

  return {
    preset: Preset.of({
      name: preset.name,
      extends_: [],
      agentIds,
      skillIds,
      commandIds,
      instructionsIds: preset.instructionsIds,
      settings: preset.settings,
    }),
    patches,
  };
}
