import { Agent } from '../../domain/model/agent.js';
import { Command } from '../../domain/model/command.js';
import { Composition } from '../../domain/model/composition.js';
import { Instructions } from '../../domain/model/instructions.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';
import { Skill } from '../../domain/model/skill.js';
import { type Patch, applyOverrides } from '../../domain/services/apply-overrides.js';
import { resolveExtends } from '../../domain/services/resolve-extends.js';
import type { CatalogPort } from '../ports/catalog.port.js';

export type BuildCompositionInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
};

const patchAgent = (agent: Agent, patches: readonly Patch[]): Agent => {
  const patch = patches.find((p) => p.target.type === 'agent' && p.target.id.equals(agent.id));
  return patch ? Agent.of(agent.id, patch.content) : agent;
};

const patchSkill = (skill: Skill, patches: readonly Patch[]): Skill => {
  const patch = patches.find((p) => p.target.type === 'skill' && p.target.id.equals(skill.id));
  return patch ? Skill.of(skill.id, patch.content) : skill;
};

const patchCommand = (command: Command, patches: readonly Patch[]): Command => {
  const patch = patches.find((p) => p.target.type === 'command' && p.target.id.equals(command.id));
  return patch ? Command.of(command.id, patch.content) : command;
};

/**
 * Hydrates a Composition from a project manifest by resolving the preset chain,
 * applying overrides, loading artifact contents from the catalog and applying
 * patches. Shared between install and check-status use cases.
 */
export const buildComposition = async (input: BuildCompositionInput): Promise<Composition> => {
  const { manifest, projectPath, catalog } = input;

  const presets = await catalog.listPresets();
  const resolved = resolveExtends(presets, manifest.presetName);
  const { preset, patches } = applyOverrides(resolved, manifest.overrides);

  const [rawAgents, rawSkills, rawCommands, rawInstructions, rawGitHooks] = await Promise.all([
    Promise.all(preset.agentIds.map((id) => catalog.readAgent(id))),
    Promise.all(preset.skillIds.map((id) => catalog.readSkill(id))),
    Promise.all(preset.commandIds.map((id) => catalog.readCommand(id))),
    Promise.all(preset.instructionsIds.map((id) => catalog.readInstructions(id))),
    Promise.all(preset.gitHookNames.map((name) => catalog.readGitHook(name))),
  ]);

  const instructions = rawInstructions.reduce(
    (acc, piece) => acc.append(piece),
    Instructions.empty(),
  );

  return Composition.of({
    projectPath,
    agents: rawAgents.map((a) => patchAgent(a, patches)),
    skills: rawSkills.map((s) => patchSkill(s, patches)),
    commands: rawCommands.map((c) => patchCommand(c, patches)),
    // git-hooks are not patchable via overrides in MVP — preset declares
    // a closed enum value, overrides do not target them.
    gitHooks: rawGitHooks,
    settings: preset.settings,
    instructions,
  });
};
