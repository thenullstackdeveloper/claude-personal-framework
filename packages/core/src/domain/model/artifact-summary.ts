import type { AgentId, CommandId, SkillId } from './identifiers.js';

export type AgentSummary = {
  readonly id: AgentId;
  readonly description: string;
};

export type SkillSummary = {
  readonly id: SkillId;
  readonly description: string;
};

export type CommandSummary = {
  readonly id: CommandId;
  readonly description: string;
};
