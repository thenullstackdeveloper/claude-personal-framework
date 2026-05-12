import type { AgentId, CommandId, PresetName, SkillId } from './identifiers.js';
import { Settings } from './settings.js';

export type PresetInit = {
  readonly name: PresetName;
  readonly extends_?: readonly PresetName[];
  readonly agentIds?: readonly AgentId[];
  readonly skillIds?: readonly SkillId[];
  readonly commandIds?: readonly CommandId[];
  readonly settings?: Settings;
};

export class Preset {
  private constructor(
    public readonly name: PresetName,
    public readonly extends_: readonly PresetName[],
    public readonly agentIds: readonly AgentId[],
    public readonly skillIds: readonly SkillId[],
    public readonly commandIds: readonly CommandId[],
    public readonly settings: Settings,
  ) {}

  static of(init: PresetInit): Preset {
    return new Preset(
      init.name,
      init.extends_ ?? [],
      init.agentIds ?? [],
      init.skillIds ?? [],
      init.commandIds ?? [],
      init.settings ?? Settings.empty(),
    );
  }

  equals(other: Preset): boolean {
    return this.name.equals(other.name);
  }
}
