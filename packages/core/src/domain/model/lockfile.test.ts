import { describe, expect, it } from 'vitest';
import { ArtifactRef } from './artifact-ref.js';
import { ContentHash } from './content-hash.js';
import { AgentId, PresetName, SkillId } from './identifiers.js';
import { LOCKFILE_VERSION, Lockfile } from './lockfile.js';
import { Settings } from './settings.js';

describe('Lockfile', () => {
  it('exposes the schema version constant', () => {
    expect(LOCKFILE_VERSION).toBe(1);
  });

  it('preserves preset name, artifacts and settings', () => {
    const hash = ContentHash.of('x');
    const lockfile = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [{ ref: ArtifactRef.agent(AgentId.of('foo')), contentHash: hash }],
      settings: Settings.of({ allow: ['Bash(ls)'] }),
    });
    expect(lockfile.presetName.toString()).toBe('base');
    expect(lockfile.artifacts).toHaveLength(1);
    expect(lockfile.settings.permissions.allow).toEqual(['Bash(ls)']);
  });

  describe('findHash', () => {
    const a1Hash = ContentHash.of('agent-1');
    const s1Hash = ContentHash.of('skill-1');
    const lockfile = Lockfile.of({
      presetName: PresetName.of('p'),
      artifacts: [
        { ref: ArtifactRef.agent(AgentId.of('foo')), contentHash: a1Hash },
        { ref: ArtifactRef.skill(SkillId.of('bar')), contentHash: s1Hash },
      ],
      settings: Settings.empty(),
    });

    it('returns the hash for a matching ref', () => {
      const found = lockfile.findHash(ArtifactRef.agent(AgentId.of('foo')));
      expect(found?.equals(a1Hash)).toBe(true);
    });

    it('returns null when the ref is not in the lockfile', () => {
      expect(lockfile.findHash(ArtifactRef.agent(AgentId.of('missing')))).toBeNull();
    });

    it('distinguishes types — agent:foo is not skill:foo', () => {
      const skillFoo = lockfile.findHash(ArtifactRef.skill(SkillId.of('foo')));
      expect(skillFoo).toBeNull();
    });
  });
});
