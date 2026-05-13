import { Agent } from '../../../domain/model/agent.js';
import { Command } from '../../../domain/model/command.js';
import { Composition } from '../../../domain/model/composition.js';
import type { AgentId, CommandId, SkillId } from '../../../domain/model/identifiers.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Skill } from '../../../domain/model/skill.js';
import { type Patch, applyOverrides } from '../../../domain/services/apply-overrides.js';
import { resolveExtends } from '../../../domain/services/resolve-extends.js';
import type { CatalogPort, WriterPort } from '../../ports/index.js';

export type InstallInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
  readonly writer: WriterPort;
};

export type InstallResult = {
  readonly composition: Composition;
  readonly written: {
    readonly agents: readonly AgentId[];
    readonly skills: readonly SkillId[];
    readonly commands: readonly CommandId[];
  };
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

export const install = async (input: InstallInput): Promise<InstallResult> => {
  const { manifest, projectPath, catalog, writer } = input;

  const presets = await catalog.listPresets();
  const resolved = resolveExtends(presets, manifest.presetName);
  const { preset, patches } = applyOverrides(resolved, manifest.overrides);

  const [rawAgents, rawSkills, rawCommands] = await Promise.all([
    Promise.all(preset.agentIds.map((id) => catalog.readAgent(id))),
    Promise.all(preset.skillIds.map((id) => catalog.readSkill(id))),
    Promise.all(preset.commandIds.map((id) => catalog.readCommand(id))),
  ]);

  const agents = rawAgents.map((a) => patchAgent(a, patches));
  const skills = rawSkills.map((s) => patchSkill(s, patches));
  const commands = rawCommands.map((c) => patchCommand(c, patches));

  const composition = Composition.of({
    projectPath,
    agents,
    skills,
    commands,
    settings: preset.settings,
  });

  await writer.cleanArtifacts();
  await Promise.all([
    ...agents.map((a) => writer.writeAgent(a)),
    ...skills.map((s) => writer.writeSkill(s)),
    ...commands.map((c) => writer.writeCommand(c)),
  ]);

  return {
    composition,
    written: {
      agents: agents.map((a) => a.id),
      skills: skills.map((s) => s.id),
      commands: commands.map((c) => c.id),
    },
  };
};
