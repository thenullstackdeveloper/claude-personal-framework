import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import type { Composition } from '../../../domain/model/composition.js';
import type { DriftReport } from '../../../domain/model/drift-report.js';
import type { AgentId, CommandId, SkillId } from '../../../domain/model/identifiers.js';
import { Lockfile } from '../../../domain/model/lockfile.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { computeDrift } from '../../../domain/services/compute-drift.js';
import type { CatalogPort, LockfileStorePort, WriterPort } from '../../ports/index.js';
import { buildComposition } from '../../services/build-composition.js';

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

export const install = async (input: InstallInput): Promise<InstallResult> => {
  const { manifest, projectPath, catalog, writer, lockfileStore } = input;

  const composition = await buildComposition({ manifest, projectPath, catalog });

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
    ...composition.agents.map((a) => writer.writeAgent(a)),
    ...composition.skills.map((s) => writer.writeSkill(s)),
    ...composition.commands.map((c) => writer.writeCommand(c)),
  ]);

  const nextLockfile = Lockfile.of({
    presetName: manifest.presetName,
    artifacts: [
      ...composition.agents.map((a) => ({
        ref: ArtifactRef.agent(a.id),
        contentHash: a.contentHash,
      })),
      ...composition.skills.map((s) => ({
        ref: ArtifactRef.skill(s.id),
        contentHash: s.contentHash,
      })),
      ...composition.commands.map((c) => ({
        ref: ArtifactRef.command(c.id),
        contentHash: c.contentHash,
      })),
    ],
    settings: composition.settings,
  });
  await lockfileStore.write(nextLockfile);

  return {
    composition,
    drift,
    written: {
      agents: composition.agents.map((a) => a.id),
      skills: composition.skills.map((s) => s.id),
      commands: composition.commands.map((c) => c.id),
    },
  };
};
