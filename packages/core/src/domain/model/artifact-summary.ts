import type { AgentId, CommandId, HookName, InstructionsId, SkillId } from './identifiers.js';

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

export type InstructionsSummary = {
  readonly id: InstructionsId;
  readonly description: string;
};

export type GitHookSummary = {
  readonly hookName: HookName;
};
