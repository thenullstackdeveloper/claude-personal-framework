import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import type { Composition } from '../../../domain/model/composition.js';
import type { DriftReport } from '../../../domain/model/drift-report.js';
import type { AgentId, CommandId, SkillId } from '../../../domain/model/identifiers.js';
import { Lockfile } from '../../../domain/model/lockfile.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { computeDrift } from '../../../domain/services/compute-drift.js';
import type {
  CatalogPort,
  LockfileStorePort,
  ProjectInspectorPort,
  WriterPort,
} from '../../ports/index.js';
import { buildComposition } from '../../services/build-composition.js';
import { UnmanagedClaudeMdError } from './errors.js';

export type InstallInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
  readonly writer: WriterPort;
  readonly lockfileStore: LockfileStorePort;
  readonly inspector: ProjectInspectorPort;
};

export type InstallResult = {
  readonly composition: Composition;
  readonly drift: DriftReport;
  readonly written: {
    readonly agents: readonly AgentId[];
    readonly skills: readonly SkillId[];
    readonly commands: readonly CommandId[];
    /** True if `.claude/settings.json` was written or rewritten. */
    readonly settings: boolean;
    /** True if `.claude/CLAUDE.md` was written or rewritten. */
    readonly instructions: boolean;
  };
};

export const install = async (input: InstallInput): Promise<InstallResult> => {
  const { manifest, projectPath, catalog, writer, lockfileStore, inspector } = input;

  const composition = await buildComposition({ manifest, projectPath, catalog });

  const previousLockfile = await lockfileStore.read();
  const drift = computeDrift(previousLockfile, composition);

  // Take-over guard: if the install would create a fresh CLAUDE.md and one
  // already exists on disk *not managed by us*, refuse. The user must
  // move or delete it before we take ownership.
  if (drift.instructions.kind === 'added' && (await inspector.claudeMdExists())) {
    throw new UnmanagedClaudeMdError();
  }

  // Delete only what the previous lockfile said was installed and no longer is.
  // Orphan files (not tracked by the lockfile) are left untouched.
  await Promise.all(
    drift.removed.map((ref) => {
      if (ref.type === 'agent') return writer.deleteAgent(ref.id);
      if (ref.type === 'skill') return writer.deleteSkill(ref.id);
      if (ref.type === 'command') return writer.deleteCommand(ref.id);
      // git-hook removals will be handled by the writer in a later sub-phase.
      return Promise.resolve();
    }),
  );

  // Write all current artifacts. Idempotent — if a file was deleted manually,
  // it gets restored. If unchanged, it gets overwritten with identical content.
  await Promise.all([
    ...composition.agents.map((a) => writer.writeAgent(a)),
    ...composition.skills.map((s) => writer.writeSkill(s)),
    ...composition.commands.map((c) => writer.writeCommand(c)),
  ]);

  // Settings is a singleton, not an artifact list. The drift outcome tells
  // us whether to write, delete, or leave alone. Empty settings are
  // represented by deleting the file (no .claude/settings.json) rather
  // than emitting an empty `{}`.
  const settingsWritten = await applySettingsDrift(writer, composition.settings, drift);
  const instructionsWritten = await applyInstructionsDrift(writer, composition.instructions, drift);

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
    instructions: composition.instructions,
  });
  await lockfileStore.write(nextLockfile);

  return {
    composition,
    drift,
    written: {
      agents: composition.agents.map((a) => a.id),
      skills: composition.skills.map((s) => s.id),
      commands: composition.commands.map((c) => c.id),
      settings: settingsWritten,
      instructions: instructionsWritten,
    },
  };
};

const applySettingsDrift = async (
  writer: WriterPort,
  settings: Composition['settings'],
  drift: DriftReport,
): Promise<boolean> => {
  switch (drift.settings.kind) {
    case 'added':
    case 'updated':
      await writer.writeSettings(settings);
      return true;
    case 'removed':
      await writer.deleteSettings();
      return false;
    case 'unchanged':
      // First install with empty settings, or re-install with identical
      // settings. In the latter case we rewrite for idempotence; in the
      // former we ensure no stale file is left behind.
      if (settings.isEmpty()) {
        await writer.deleteSettings();
        return false;
      }
      await writer.writeSettings(settings);
      return true;
  }
};

const applyInstructionsDrift = async (
  writer: WriterPort,
  instructions: Composition['instructions'],
  drift: DriftReport,
): Promise<boolean> => {
  switch (drift.instructions.kind) {
    case 'added':
    case 'updated':
      await writer.writeInstructions(instructions);
      return true;
    case 'removed':
      await writer.deleteInstructions();
      return false;
    case 'unchanged':
      if (instructions.isEmpty()) {
        await writer.deleteInstructions();
        return false;
      }
      await writer.writeInstructions(instructions);
      return true;
  }
};
