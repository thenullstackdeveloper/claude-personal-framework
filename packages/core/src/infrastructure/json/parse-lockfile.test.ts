import { describe, expect, it } from 'vitest';
import { InvalidContentHashError, InvalidLockfileError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { ContentHash } from '../../domain/model/content-hash.js';
import { AgentId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { Lockfile } from '../../domain/model/lockfile.js';
import { Settings } from '../../domain/model/settings.js';
import { parseLockfile, serializeLockfile } from './parse-lockfile.js';

const aHash = ContentHash.of('agent content').toString();
const sHash = ContentHash.of('skill content').toString();

describe('parseLockfile', () => {
  it('parses a minimal lockfile', () => {
    const json = JSON.stringify({
      version: 1,
      presetName: 'base',
      artifacts: [],
      settings: { permissions: { allow: [], deny: [] } },
    });
    const lockfile = parseLockfile(json);
    expect(lockfile.presetName.toString()).toBe('base');
    expect(lockfile.artifacts).toEqual([]);
  });

  it('parses artifacts with each kind', () => {
    const json = JSON.stringify({
      version: 1,
      presetName: 'p',
      artifacts: [
        { type: 'agent', id: 'a1', sha: aHash },
        { type: 'skill', id: 's1', sha: sHash },
        { type: 'command', id: 'c1', sha: aHash },
      ],
      settings: { permissions: { allow: [], deny: [] } },
    });
    const lockfile = parseLockfile(json);
    expect(lockfile.artifacts.map((a) => `${a.ref.type}:${a.ref.id.toString()}`)).toEqual([
      'agent:a1',
      'skill:s1',
      'command:c1',
    ]);
  });

  it('parses settings permissions', () => {
    const json = JSON.stringify({
      version: 1,
      presetName: 'p',
      artifacts: [],
      settings: { permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm)'] } },
    });
    const lockfile = parseLockfile(json);
    expect(lockfile.settings.permissions.allow).toEqual(['Bash(ls)']);
    expect(lockfile.settings.permissions.deny).toEqual(['Bash(rm)']);
  });

  describe('errors', () => {
    it('rejects unparseable JSON', () => {
      expect(() => parseLockfile('{not json')).toThrow(InvalidLockfileError);
    });

    it('rejects a non-object root', () => {
      expect(() => parseLockfile('[]')).toThrow(InvalidLockfileError);
    });

    it('rejects an unknown version', () => {
      const json = JSON.stringify({ version: 999, presetName: 'p', artifacts: [] });
      expect(() => parseLockfile(json)).toThrow(InvalidLockfileError);
    });

    it('rejects missing presetName', () => {
      const json = JSON.stringify({ version: 1, artifacts: [] });
      expect(() => parseLockfile(json)).toThrow(InvalidLockfileError);
    });

    it('rejects an unknown artifact type', () => {
      const json = JSON.stringify({
        version: 1,
        presetName: 'p',
        artifacts: [{ type: 'widget', id: 'foo', sha: aHash }],
      });
      expect(() => parseLockfile(json)).toThrow(InvalidLockfileError);
    });

    it('propagates InvalidContentHashError for invalid sha', () => {
      const json = JSON.stringify({
        version: 1,
        presetName: 'p',
        artifacts: [{ type: 'agent', id: 'foo', sha: 'not-hex' }],
      });
      expect(() => parseLockfile(json)).toThrow(InvalidContentHashError);
    });

    it('rejects artifacts that is not a list', () => {
      const json = JSON.stringify({ version: 1, presetName: 'p', artifacts: 'oops' });
      expect(() => parseLockfile(json)).toThrow(InvalidLockfileError);
    });
  });
});

describe('serializeLockfile', () => {
  it('produces JSON that parses back to an equivalent lockfile', () => {
    const original = Lockfile.of({
      presetName: PresetName.of('nestjs'),
      artifacts: [
        {
          ref: ArtifactRef.agent(AgentId.of('hexagonal-architect')),
          contentHash: ContentHash.of('content-a'),
        },
        {
          ref: ArtifactRef.skill(SkillId.of('hex-rn')),
          contentHash: ContentHash.of('content-s'),
        },
      ],
      settings: Settings.of({ allow: ['Bash(ls)'], deny: [] }),
    });

    const json = serializeLockfile(original);
    const restored = parseLockfile(json);

    expect(restored.presetName.toString()).toBe('nestjs');
    expect(restored.artifacts.map((a) => `${a.ref.type}:${a.ref.id.toString()}`)).toEqual([
      'agent:hexagonal-architect',
      'skill:hex-rn',
    ]);
    expect(restored.settings.permissions.allow).toEqual(['Bash(ls)']);
  });

  it('ends with a trailing newline (POSIX-friendly)', () => {
    const lockfile = Lockfile.of({
      presetName: PresetName.of('p'),
      artifacts: [],
      settings: Settings.empty(),
    });
    expect(serializeLockfile(lockfile).endsWith('\n')).toBe(true);
  });
});
