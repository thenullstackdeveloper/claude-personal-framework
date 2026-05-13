import type { Agent } from '../../../domain/model/agent.js';
import type { Command } from '../../../domain/model/command.js';
import type { AgentId, CommandId, SkillId } from '../../../domain/model/identifiers.js';
import type { Preset } from '../../../domain/model/preset.js';
import type { Skill } from '../../../domain/model/skill.js';

export interface CatalogPort {
  listPresets(): Promise<readonly Preset[]>;
  readAgent(id: AgentId): Promise<Agent>;
  readSkill(id: SkillId): Promise<Skill>;
  readCommand(id: CommandId): Promise<Command>;
}

export interface WriterPort {
  cleanArtifacts(): Promise<void>;
  writeAgent(agent: Agent): Promise<void>;
  writeSkill(skill: Skill): Promise<void>;
  writeCommand(command: Command): Promise<void>;
}
