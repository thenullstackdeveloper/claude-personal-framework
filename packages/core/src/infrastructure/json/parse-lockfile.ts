import { InvalidLockfileError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { ContentHash } from '../../domain/model/content-hash.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { LOCKFILE_VERSION, type LockedArtifact, Lockfile } from '../../domain/model/lockfile.js';
import { Settings } from '../../domain/model/settings.js';

const isObject = (v: unknown): v is Record<string, unknown> => {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
};

const isStringArray = (v: unknown): v is readonly string[] => {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
};

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

const parseSettings = (raw: unknown): Settings => {
  if (raw === undefined) return Settings.empty();
  if (!isObject(raw)) {
    throw new InvalidLockfileError('"settings" must be an object');
  }
  const perms = raw['permissions'];
  if (perms === undefined) return Settings.empty();
  if (!isObject(perms)) {
    throw new InvalidLockfileError('"settings.permissions" must be an object');
  }
  const allow = perms['allow'];
  const deny = perms['deny'];
  if (allow !== undefined && !isStringArray(allow)) {
    throw new InvalidLockfileError('"settings.permissions.allow" must be a list of strings');
  }
  if (deny !== undefined && !isStringArray(deny)) {
    throw new InvalidLockfileError('"settings.permissions.deny" must be a list of strings');
  }
  return Settings.of({
    ...(allow && { allow }),
    ...(deny && { deny }),
  });
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

  return Lockfile.of({ presetName, artifacts, settings });
};

export const serializeLockfile = (lockfile: Lockfile): string => {
  const out = {
    version: LOCKFILE_VERSION,
    presetName: lockfile.presetName.toString(),
    artifacts: lockfile.artifacts.map((a) => ({
      type: a.ref.type,
      id: a.ref.id.toString(),
      sha: a.contentHash.toString(),
    })),
    settings: {
      permissions: {
        allow: lockfile.settings.permissions.allow,
        deny: lockfile.settings.permissions.deny,
      },
    },
  };
  return `${JSON.stringify(out, null, 2)}\n`;
};
