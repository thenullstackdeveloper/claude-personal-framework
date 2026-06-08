import type { Agent } from '../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  GitHookSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../domain/model/artifact-summary.js';
import type { Command } from '../../domain/model/command.js';
import type { GitHook } from '../../domain/model/git-hook.js';
import type {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  SkillId,
} from '../../domain/model/identifiers.js';
import type { Instructions } from '../../domain/model/instructions.js';
import type { Preset } from '../../domain/model/preset.js';
import type { Skill } from '../../domain/model/skill.js';

export interface CatalogPort {
  listPresets(): Promise<readonly Preset[]>;

  listAgents(): Promise<readonly AgentSummary[]>;
  listSkills(): Promise<readonly SkillSummary[]>;
  listCommands(): Promise<readonly CommandSummary[]>;
  listInstructions(): Promise<readonly InstructionsSummary[]>;
  listGitHooks(): Promise<readonly GitHookSummary[]>;

  readAgent(id: AgentId): Promise<Agent>;
  readSkill(id: SkillId): Promise<Skill>;
  readCommand(id: CommandId): Promise<Command>;
  readInstructions(id: InstructionsId): Promise<Instructions>;
  readGitHook(hookName: HookName): Promise<GitHook>;
}
