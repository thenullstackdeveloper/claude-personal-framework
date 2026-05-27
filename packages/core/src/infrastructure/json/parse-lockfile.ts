import { InvalidLockfileError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { ContentHash } from '../../domain/model/content-hash.js';
import {
  type CommandHook,
  type HookEvent,
  type HookRule,
  Hooks,
} from '../../domain/model/hooks.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { Instructions } from '../../domain/model/instructions.js';
import { LOCKFILE_VERSION, type LockedArtifact, Lockfile } from '../../domain/model/lockfile.js';
import { Settings } from '../../domain/model/settings.js';

const KNOWN_HOOK_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'Notification',
]);

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

const parseCommandHook = (raw: unknown, path: string): CommandHook => {
  if (!isObject(raw)) {
    throw new InvalidLockfileError(`"${path}" must be an object`);
  }
  if (raw['type'] !== 'command') {
    throw new InvalidLockfileError(`"${path}.type" must be "command"`);
  }
  if (typeof raw['command'] !== 'string') {
    throw new InvalidLockfileError(`"${path}.command" must be a string`);
  }
  const timeout = raw['timeout'];
  if (timeout !== undefined && typeof timeout !== 'number') {
    throw new InvalidLockfileError(`"${path}.timeout" must be a number`);
  }
  return timeout === undefined
    ? { type: 'command', command: raw['command'] }
    : { type: 'command', command: raw['command'], timeout };
};

const parseHookRule = (raw: unknown, path: string): HookRule => {
  if (!isObject(raw)) {
    throw new InvalidLockfileError(`"${path}" must be an object`);
  }
  const matcher = raw['matcher'];
  if (matcher !== undefined && typeof matcher !== 'string') {
    throw new InvalidLockfileError(`"${path}.matcher" must be a string`);
  }
  const hooks = raw['hooks'];
  if (!Array.isArray(hooks)) {
    throw new InvalidLockfileError(`"${path}.hooks" must be a list`);
  }
  return {
    matcher: matcher ?? '',
    hooks: hooks.map((h, i) => parseCommandHook(h, `${path}.hooks[${i}]`)),
  };
};

const parseHooks = (raw: unknown): Hooks => {
  if (raw === undefined) return Hooks.empty();
  if (!isObject(raw)) {
    throw new InvalidLockfileError('"settings.hooks" must be an object');
  }
  const entries: Partial<Record<HookEvent, readonly HookRule[]>> = {};
  for (const [event, value] of Object.entries(raw)) {
    if (!KNOWN_HOOK_EVENTS.has(event as HookEvent)) {
      throw new InvalidLockfileError(`unknown hook event "${event}" in "settings.hooks"`);
    }
    if (!Array.isArray(value)) {
      throw new InvalidLockfileError(`"settings.hooks.${event}" must be a list`);
    }
    entries[event as HookEvent] = value.map((r, i) =>
      parseHookRule(r, `settings.hooks.${event}[${i}]`),
    );
  }
  return Hooks.of(entries);
};

const parseSettings = (raw: unknown): Settings => {
  if (raw === undefined) return Settings.empty();
  if (!isObject(raw)) {
    throw new InvalidLockfileError('"settings" must be an object');
  }

  let allow: readonly string[] = [];
  let deny: readonly string[] = [];
  const perms = raw['permissions'];
  if (perms !== undefined) {
    if (!isObject(perms)) {
      throw new InvalidLockfileError('"settings.permissions" must be an object');
    }
    const allowRaw = perms['allow'];
    const denyRaw = perms['deny'];
    if (allowRaw !== undefined && !isStringArray(allowRaw)) {
      throw new InvalidLockfileError('"settings.permissions.allow" must be a list of strings');
    }
    if (denyRaw !== undefined && !isStringArray(denyRaw)) {
      throw new InvalidLockfileError('"settings.permissions.deny" must be a list of strings');
    }
    if (allowRaw) allow = allowRaw;
    if (denyRaw) deny = denyRaw;
  }

  const hooks = parseHooks(raw['hooks']);
  return Settings.of({ permissions: { allow, deny }, hooks });
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

  return Lockfile.of({
    presetName,
    artifacts,
    settings,
    ...(settingsHash && { settingsHash }),
    instructions,
    ...(instructionsHash && { instructionsHash }),
  });
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
    artifacts: lockfile.artifacts.map((a) => ({
      type: a.ref.type,
      id: a.ref.id.toString(),
      sha: a.contentHash.toString(),
    })),
    settings: settingsObj,
    settingsHash: lockfile.settingsHash.toString(),
  };

  if (!lockfile.instructions.isEmpty()) {
    out['instructions'] = { content: lockfile.instructions.content };
  }
  out['instructionsHash'] = lockfile.instructionsHash.toString();

  return `${JSON.stringify(out, null, 2)}\n`;
};
