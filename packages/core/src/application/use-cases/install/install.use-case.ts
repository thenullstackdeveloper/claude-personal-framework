import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import type { Composition } from '../../../domain/model/composition.js';
import type { DriftReport } from '../../../domain/model/drift-report.js';
import type { AgentId, CommandId, HookName, SkillId } from '../../../domain/model/identifiers.js';
import { Lockfile } from '../../../domain/model/lockfile.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { computeDrift } from '../../../domain/services/compute-drift.js';
import type {
  CatalogPort,
  GitConfigPort,
  LockfileStorePort,
  ProjectInspectorPort,
  WriterPort,
} from '../../ports/index.js';
import { buildComposition } from '../../services/build-composition.js';
import { UnmanagedClaudeMdError, UnmanagedGitHookError } from './errors.js';

const GITHOOKS_DIR = '.githooks';

export type InstallInput = {
  readonly manifest: ProjectManifest;
  readonly projectPath: string;
  readonly catalog: CatalogPort;
  readonly writer: WriterPort;
  readonly lockfileStore: LockfileStorePort;
  readonly inspector: ProjectInspectorPort;
  /**
   * Optional so existing tests that don't exercise git-hooks keep
   * working unchanged. When git-hooks are present in the composition,
   * the use case will still write them via the writer; activation of
   * `core.hooksPath` only happens when this port is provided.
   */
  readonly gitConfig?: GitConfigPort;
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
    readonly gitHooks: readonly HookName[];
    /** True if `git config core.hooksPath` was set during this install. */
    readonly gitConfigActivated: boolean;
  };
};

export const install = async (input: InstallInput): Promise<InstallResult> => {
  const { manifest, projectPath, catalog, writer, lockfileStore, inspector, gitConfig } = input;

  const composition = await buildComposition({ manifest, projectPath, catalog });

  const previousLockfile = await lockfileStore.read();
  const drift = computeDrift(previousLockfile, composition);

  // Take-over guard for CLAUDE.md.
  if (drift.instructions.kind === 'added' && (await inspector.claudeMdExists())) {
    throw new UnmanagedClaudeMdError();
  }

  // Take-over guard for each git-hook: refuse to clobber a user-authored
  // .githooks/<hookName> that the lockfile doesn't manage. Check only
  // hooks the drift reports as `added` — `unchanged`/`updated` are
  // already certified by the previous lockfile.
  for (const ref of drift.added) {
    if (ref.type === 'git-hook' && (await inspector.gitHookExists(ref.hookName))) {
      throw new UnmanagedGitHookError(ref.hookName);
    }
  }

  // Delete only what the previous lockfile said was installed and no longer is.
  await Promise.all(
    drift.removed.map((ref) => {
      if (ref.type === 'agent') return writer.deleteAgent(ref.id);
      if (ref.type === 'skill') return writer.deleteSkill(ref.id);
      if (ref.type === 'command') return writer.deleteCommand(ref.id);
      return writer.deleteGitHook(ref.hookName);
    }),
  );

  // Write all current artifacts.
  await Promise.all([
    ...composition.agents.map((a) => writer.writeAgent(a)),
    ...composition.skills.map((s) => writer.writeSkill(s)),
    ...composition.commands.map((c) => writer.writeCommand(c)),
    ...composition.gitHooks.map((h) => writer.writeGitHook(h)),
  ]);

  const settingsWritten = await applySettingsDrift(writer, composition.settings, drift);
  const instructionsWritten = await applyInstructionsDrift(writer, composition.instructions, drift);

  // Activation of `core.hooksPath`: only when at least one git-hook is
  // in the composition and the user hasn't already configured the
  // setting to something. Idempotent: re-installs leave existing config
  // untouched whether it matches `.githooks` or not.
  const gitConfigActivated = await maybeActivateHooksPath(gitConfig, composition.gitHooks.length);

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
    gitHooks: composition.gitHooks.map((h) => ({
      hookName: h.hookName,
      contentHash: h.contentHash,
    })),
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
      gitHooks: composition.gitHooks.map((h) => h.hookName),
      gitConfigActivated,
    },
  };
};

const maybeActivateHooksPath = async (
  gitConfig: GitConfigPort | undefined,
  hookCount: number,
): Promise<boolean> => {
  if (!gitConfig || hookCount === 0) return false;
  const current = await gitConfig.getHooksPath();
  if (current !== null) return false; // respect any existing user choice
  await gitConfig.setHooksPath(GITHOOKS_DIR);
  return true;
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
