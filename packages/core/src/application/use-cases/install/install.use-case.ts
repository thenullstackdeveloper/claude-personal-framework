import { Agent } from '../../../domain/model/agent.js';
import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import { Command } from '../../../domain/model/command.js';
import { Composition } from '../../../domain/model/composition.js';
import type { DriftReport } from '../../../domain/model/drift-report.js';
import type { AgentId, CommandId, SkillId } from '../../../domain/model/identifiers.js';
import { Lockfile } from '../../../domain/model/lockfile.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Skill } from '../../../domain/model/skill.js';
import { type Patch, applyOverrides } from '../../../domain/services/apply-overrides.js';
import { computeDrift } from '../../../domain/services/compute-drift.js';
import { resolveExtends } from '../../../domain/services/resolve-extends.js';
import type { CatalogPort, LockfileStorePort, WriterPort } from '../../ports/index.js';

export type InstallInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
  readonly writer: WriterPort;
  readonly lockfileStore: LockfileStorePort;
};

export type InstallResult = {
  readonly composition: Composition;
  readonly drift: DriftReport;
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
  const { manifest, projectPath, catalog, writer, lockfileStore } = input;

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

  const previousLockfile = await lockfileStore.read();
  const drift = computeDrift(previousLockfile, composition);

  // Delete only what the previous lockfile said was installed and no longer is.
  // Orphan files (not tracked by the lockfile) are left untouched.
  await Promise.all(
    drift.removed.map((ref) => {
      if (ref.type === 'agent') return writer.deleteAgent(ref.id);
      if (ref.type === 'skill') return writer.deleteSkill(ref.id);
      return writer.deleteCommand(ref.id);
    }),
  );

  // Write all current artifacts. Idempotent — if a file was deleted manually,
  // it gets restored. If unchanged, it gets overwritten with identical content.
  await Promise.all([
    ...agents.map((a) => writer.writeAgent(a)),
    ...skills.map((s) => writer.writeSkill(s)),
    ...commands.map((c) => writer.writeCommand(c)),
  ]);

  const nextLockfile = Lockfile.of({
    presetName: manifest.presetName,
    artifacts: [
      ...agents.map((a) => ({
        ref: ArtifactRef.agent(a.id),
        contentHash: a.contentHash,
      })),
      ...skills.map((s) => ({
        ref: ArtifactRef.skill(s.id),
        contentHash: s.contentHash,
      })),
      ...commands.map((c) => ({
        ref: ArtifactRef.command(c.id),
        contentHash: c.contentHash,
      })),
    ],
    settings: preset.settings,
  });
  await lockfileStore.write(nextLockfile);

  return {
    composition,
    drift,
    written: {
      agents: agents.map((a) => a.id),
      skills: skills.map((s) => s.id),
      commands: commands.map((c) => c.id),
    },
  };
};
