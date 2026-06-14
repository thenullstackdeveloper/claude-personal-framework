import { InvalidHookNameError, InvalidLockfileError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { ContentHash } from '../../domain/model/content-hash.js';
import {
  AgentId,
  CommandId,
  HookName,
  PresetName,
  SkillId,
} from '../../domain/model/identifiers.js';
import { Instructions } from '../../domain/model/instructions.js';
import {
  LOCKFILE_VERSION,
  type LockedArtifact,
  type LockedGitHook,
  Lockfile,
} from '../../domain/model/lockfile.js';
import { isObject } from '../_shared/object-guards.js';
import { createSettingsParser } from '../_shared/settings-parsing.js';

const parseSettings = createSettingsParser({
  errorFactory: (msg) => new InvalidLockfileError(msg),
  fieldPrefix: '',
});

const parseArtifact = (raw: unknown, index: number): LockedArtifact => {
  if (!isObject(raw)) {
    throw new InvalidLockfileError(`artifact #${index} must be an object`);
  }
  const type = raw['type'];
  const id = raw['id'];
  const sha = raw['sha'];

  if (typeof id !== 'string' || typeof sha !== 'string') {
    throw new InvalidLockfileError(`artifact #${index} must have string "id" and "sha" fields`);
  }
  const contentHash = ContentHash.fromHex(sha);

  if (type === 'agent') return { ref: ArtifactRef.agent(AgentId.of(id)), contentHash };
  if (type === 'skill') return { ref: ArtifactRef.skill(SkillId.of(id)), contentHash };
  if (type === 'command') return { ref: ArtifactRef.command(CommandId.of(id)), contentHash };

  throw new InvalidLockfileError(
    `artifact #${index} has unknown type "${String(type)}" (expected agent | skill | command)`,
  );
};

export const parseLockfile = (jsonText: string): Lockfile => {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new InvalidLockfileError(`failed to parse lockfile JSON — ${(err as Error).message}`);
  }
  if (!isObject(raw)) {
    throw new InvalidLockfileError('lockfile root must be an object');
  }

  if (raw['version'] !== LOCKFILE_VERSION) {
    throw new InvalidLockfileError(
      `unsupported lockfile version: got ${String(raw['version'])}, expected ${LOCKFILE_VERSION}`,
    );
  }

  const presetNameRaw = raw['presetName'];
  if (typeof presetNameRaw !== 'string' || !presetNameRaw) {
    throw new InvalidLockfileError('"presetName" must be a non-empty string');
  }
  const presetName = PresetName.of(presetNameRaw);

  const artifactsRaw = raw['artifacts'];
  if (artifactsRaw !== undefined && !Array.isArray(artifactsRaw)) {
    throw new InvalidLockfileError('"artifacts" must be a list');
  }
  const artifacts = (artifactsRaw ?? []).map((item: unknown, i: number) => parseArtifact(item, i));

  const settings = parseSettings(raw['settings']);

  // settingsHash is optional for back-compat with lockfiles written before
  // hooks landed. If present, validate it; otherwise compute from settings.
  let settingsHash: ContentHash | undefined;
  const settingsHashRaw = raw['settingsHash'];
  if (settingsHashRaw !== undefined) {
    if (typeof settingsHashRaw !== 'string') {
      throw new InvalidLockfileError('"settingsHash" must be a string');
    }
    settingsHash = ContentHash.fromHex(settingsHashRaw);
  }

  // instructions + instructionsHash are optional for back-compat with
  // lockfiles written before instructions landed. Same pattern as settings:
  // missing → empty + computed hash.
  let instructions: Instructions = Instructions.empty();
  const instructionsRaw = raw['instructions'];
  if (instructionsRaw !== undefined) {
    if (!isObject(instructionsRaw)) {
      throw new InvalidLockfileError('"instructions" must be an object');
    }
    const content = instructionsRaw['content'];
    if (content !== undefined && typeof content !== 'string') {
      throw new InvalidLockfileError('"instructions.content" must be a string');
    }
    if (typeof content === 'string') {
      instructions = Instructions.of(content);
    }
  }

  let instructionsHash: ContentHash | undefined;
  const instructionsHashRaw = raw['instructionsHash'];
  if (instructionsHashRaw !== undefined) {
    if (typeof instructionsHashRaw !== 'string') {
      throw new InvalidLockfileError('"instructionsHash" must be a string');
    }
    instructionsHash = ContentHash.fromHex(instructionsHashRaw);
  }

  // gitHooks is optional for back-compat with lockfiles written before
  // git-hooks landed. Missing → empty list.
  const gitHooksRaw = raw['gitHooks'];
  if (gitHooksRaw !== undefined && !Array.isArray(gitHooksRaw)) {
    throw new InvalidLockfileError('"gitHooks" must be a list');
  }
  const gitHooks = (gitHooksRaw ?? []).map((item: unknown, i: number) => parseGitHook(item, i));

  return Lockfile.of({
    presetName,
    artifacts,
    settings,
    ...(settingsHash && { settingsHash }),
    instructions,
    ...(instructionsHash && { instructionsHash }),
    gitHooks,
  });
};

const parseGitHook = (raw: unknown, index: number): LockedGitHook => {
  if (!isObject(raw)) {
    throw new InvalidLockfileError(`gitHook #${index} must be an object`);
  }
  const hookNameRaw = raw['hookName'];
  const sha = raw['sha'];
  if (typeof hookNameRaw !== 'string' || typeof sha !== 'string') {
    throw new InvalidLockfileError(
      `gitHook #${index} must have string "hookName" and "sha" fields`,
    );
  }
  let hookName: HookName;
  try {
    hookName = HookName.of(hookNameRaw);
  } catch (err) {
    if (err instanceof InvalidHookNameError) {
      throw new InvalidLockfileError(
        `gitHook #${index} has unknown hookName "${hookNameRaw}" (expected commit-msg | pre-commit | pre-push)`,
      );
    }
    throw err;
  }
  return { hookName, contentHash: ContentHash.fromHex(sha) };
};

export const serializeLockfile = (lockfile: Lockfile): string => {
  const settingsObj: Record<string, unknown> = {};
  const { permissions, hooks } = lockfile.settings;
  if (permissions.allow.length > 0 || permissions.deny.length > 0) {
    settingsObj['permissions'] = {
      allow: permissions.allow,
      deny: permissions.deny,
    };
  }
  if (!hooks.isEmpty()) {
    settingsObj['hooks'] = hooks.toObject();
  }

  const out: Record<string, unknown> = {
    version: LOCKFILE_VERSION,
    presetName: lockfile.presetName.toString(),
    artifacts: lockfile.artifacts.map((a) => {
      // git-hook refs live in the gitHooks section, not here.
      if (a.ref.type === 'git-hook') {
        throw new Error('lockfile.artifacts is not expected to contain git-hook refs');
      }
      return {
        type: a.ref.type,
        id: a.ref.id.toString(),
        sha: a.contentHash.toString(),
      };
    }),
    settings: settingsObj,
    settingsHash: lockfile.settingsHash.toString(),
  };

  if (!lockfile.instructions.isEmpty()) {
    out['instructions'] = { content: lockfile.instructions.content };
  }
  out['instructionsHash'] = lockfile.instructionsHash.toString();
  // Always emit gitHooks (empty array included) — congruent with the
  // existing `artifacts: []` policy and gives readers a stable shape.
  out['gitHooks'] = lockfile.gitHooks.map((h) => ({
    hookName: h.hookName,
    sha: h.contentHash.toString(),
  }));

  return `${JSON.stringify(out, null, 2)}\n`;
};
