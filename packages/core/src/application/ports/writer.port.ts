import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { Skill } from '../../domain/model/skill.js';

export interface WriterPort {
  cleanArtifacts(): Promise<void>;
  writeAgent(agent: Agent): Promise<void>;
  writeSkill(skill: Skill): Promise<void>;
  writeCommand(command: Command): Promise<void>;
}
