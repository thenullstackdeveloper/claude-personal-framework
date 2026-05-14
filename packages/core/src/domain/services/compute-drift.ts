import { ArtifactRef } from '../model/artifact-ref.js';
import type { Composition } from '../model/composition.js';
import type { ContentHash } from '../model/content-hash.js';
import type { DriftReport, DriftUpdate } from '../model/drift-report.js';
import type { Lockfile } from '../model/lockfile.js';

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
  return out;
};

const refsFromComposition = (composition: Composition): readonly ArtifactRef[] => {
  return refsWithHashesOf(composition).map((rh) => rh.ref);
};

export const computeDrift = (lockfile: Lockfile | null, composition: Composition): DriftReport => {
  const currentRefsWithHashes = refsWithHashesOf(composition);

  if (lockfile === null) {
    return {
      added: currentRefsWithHashes.map((rh) => rh.ref),
      updated: [],
      removed: [],
      unchanged: [],
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
  const removed = lockfile.artifacts
    .map((a) => a.ref)
    .filter((lockedRef) => !currentRefs.some((cr) => ArtifactRef.equals(cr, lockedRef)));

  return { added, updated, removed, unchanged };
};
