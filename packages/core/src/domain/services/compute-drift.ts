import { ArtifactRef } from '../model/artifact-ref.js';
import type { Composition } from '../model/composition.js';
import type { ContentHash } from '../model/content-hash.js';
import type { DriftReport, DriftUpdate, SingletonDrift } from '../model/drift-report.js';
import type { Lockfile } from '../model/lockfile.js';

type Hashable = {
  isEmpty(): boolean;
  contentHash(): ContentHash;
};

type RefWithHash = {
  readonly ref: ArtifactRef;
  readonly hash: ContentHash;
};

const refsWithHashesOf = (composition: Composition): readonly RefWithHash[] => {
  const out: RefWithHash[] = [];
  for (const agent of composition.agents) {
    out.push({ ref: ArtifactRef.agent(agent.id), hash: agent.contentHash });
  }
  for (const skill of composition.skills) {
    out.push({ ref: ArtifactRef.skill(skill.id), hash: skill.contentHash });
  }
  for (const command of composition.commands) {
    out.push({ ref: ArtifactRef.command(command.id), hash: command.contentHash });
  }
  for (const hook of composition.gitHooks) {
    out.push({ ref: ArtifactRef.gitHook(hook.hookName), hash: hook.contentHash });
  }
  return out;
};

const refsFromComposition = (composition: Composition): readonly ArtifactRef[] => {
  return refsWithHashesOf(composition).map((rh) => rh.ref);
};

const singletonDrift = <T extends Hashable>(
  oldSha: ContentHash | null,
  next: T,
): SingletonDrift => {
  const isEmpty = next.isEmpty();
  if (oldSha === null) {
    return isEmpty ? { kind: 'unchanged' } : { kind: 'added' };
  }
  if (isEmpty) {
    return { kind: 'removed', oldSha };
  }
  const newSha = next.contentHash();
  if (oldSha.equals(newSha)) return { kind: 'unchanged' };
  return { kind: 'updated', oldSha, newSha };
};

export const computeDrift = (lockfile: Lockfile | null, composition: Composition): DriftReport => {
  const currentRefsWithHashes = refsWithHashesOf(composition);

  if (lockfile === null) {
    return {
      added: currentRefsWithHashes.map((rh) => rh.ref),
      updated: [],
      removed: [],
      unchanged: [],
      settings: composition.settings.isEmpty() ? { kind: 'unchanged' } : { kind: 'added' },
      instructions: composition.instructions.isEmpty() ? { kind: 'unchanged' } : { kind: 'added' },
    };
  }

  const added: ArtifactRef[] = [];
  const updated: DriftUpdate[] = [];
  const unchanged: ArtifactRef[] = [];

  for (const { ref, hash: newSha } of currentRefsWithHashes) {
    const oldSha = lockfile.findHash(ref);
    if (oldSha === null) {
      added.push(ref);
      continue;
    }
    if (oldSha.equals(newSha)) {
      unchanged.push(ref);
    } else {
      updated.push({ ref, oldSha, newSha });
    }
  }

  const currentRefs = refsFromComposition(composition);
  const lockedRefs: readonly ArtifactRef[] = [
    ...lockfile.artifacts.map((a) => a.ref),
    ...lockfile.gitHooks.map((h) => ArtifactRef.gitHook(h.hookName)),
  ];
  const removed = lockedRefs.filter(
    (lockedRef) => !currentRefs.some((cr) => ArtifactRef.equals(cr, lockedRef)),
  );

  // Settings drift: the lockfile carries the previous hash. We treat the
  // *empty* settings as "not installed" — so going from non-empty to empty
  // is a remove, and the previous hash was for empty (which is "{}") only
  // if the lockfile was written before settings supported hooks. In that
  // case the recorded settings is also empty and we resolve to unchanged.
  const previousSettingsHash = lockfile.settings.isEmpty() ? null : lockfile.settingsHash;
  const settingsDrift = singletonDrift(previousSettingsHash, composition.settings);

  const previousInstructionsHash = lockfile.instructions.isEmpty()
    ? null
    : lockfile.instructionsHash;
  const instructionsDrift = singletonDrift(previousInstructionsHash, composition.instructions);

  return {
    added,
    updated,
    removed,
    unchanged,
    settings: settingsDrift,
    instructions: instructionsDrift,
  };
};
