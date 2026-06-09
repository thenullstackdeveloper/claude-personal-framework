import type {
  AgentSummary,
  CommandSummary,
  GitHookSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../../domain/model/artifact-summary.js';
import type { Preset } from '../../../domain/model/preset.js';
import type { CatalogPort } from '../../ports/index.js';

export type ListCatalogInput = {
  readonly catalog: CatalogPort;
};

export type ListCatalogResult = {
  readonly presets: readonly Preset[];
  readonly agents: readonly AgentSummary[];
  readonly skills: readonly SkillSummary[];
  readonly commands: readonly CommandSummary[];
  readonly instructions: readonly InstructionsSummary[];
  readonly gitHooks: readonly GitHookSummary[];
};

export const listCatalog = async ({ catalog }: ListCatalogInput): Promise<ListCatalogResult> => {
  const [presets, agents, skills, commands, instructions, gitHooks] = await Promise.all([
    catalog.listPresets(),
    catalog.listAgents(),
    catalog.listSkills(),
    catalog.listCommands(),
    catalog.listInstructions(),
    catalog.listGitHooks(),
  ]);
  return { presets, agents, skills, commands, instructions, gitHooks };
};
