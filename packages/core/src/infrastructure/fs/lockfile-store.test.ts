import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidLockfileError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { ContentHash } from '../../domain/model/content-hash.js';
import { AgentId, PresetName } from '../../domain/model/identifiers.js';
import { Instructions } from '../../domain/model/instructions.js';
import { Lockfile } from '../../domain/model/lockfile.js';
import { Settings } from '../../domain/model/settings.js';
import { LockfileStore } from './lockfile-store.js';

describe('LockfileStore', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cfw-lock-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe('read', () => {
    it('returns null when no lockfile exists', async () => {
      const store = new LockfileStore(projectRoot);
      expect(await store.read()).toBeNull();
    });

    it('returns the parsed Lockfile when the file exists', async () => {
      const hash = ContentHash.of('x').toString();
      await writeFile(
        join(projectRoot, '.claude-fw.lock.json'),
        JSON.stringify({
          version: 1,
          presetName: 'base',
          artifacts: [{ type: 'agent', id: 'docs-manager', sha: hash }],
          settings: { permissions: { allow: [], deny: [] } },
        }),
        'utf-8',
      );

      const store = new LockfileStore(projectRoot);
      const lockfile = await store.read();
      expect(lockfile).not.toBeNull();
      expect(lockfile?.presetName.toString()).toBe('base');
      expect(lockfile?.artifacts).toHaveLength(1);
    });

    it('throws InvalidLockfileError when the file is malformed', async () => {
      await writeFile(join(projectRoot, '.claude-fw.lock.json'), 'not json', 'utf-8');
      const store = new LockfileStore(projectRoot);
      await expect(store.read()).rejects.toThrow(InvalidLockfileError);
    });
  });

  describe('write', () => {
    it('writes the lockfile to .claude-fw.lock.json in the project root', async () => {
      const store = new LockfileStore(projectRoot);
      const lockfile = Lockfile.of({
        presetName: PresetName.of('base'),
        artifacts: [
          {
            ref: ArtifactRef.agent(AgentId.of('docs-manager')),
            contentHash: ContentHash.of('body'),
          },
        ],
        settings: Settings.empty(),
        instructions: Instructions.empty(),
      });

      await store.write(lockfile);

      const onDisk = await readFile(join(projectRoot, '.claude-fw.lock.json'), 'utf-8');
      const parsed = JSON.parse(onDisk);
      expect(parsed.version).toBe(1);
      expect(parsed.presetName).toBe('base');
      expect(parsed.artifacts[0].type).toBe('agent');
      expect(parsed.artifacts[0].id).toBe('docs-manager');
    });

    it('overwrites an existing lockfile', async () => {
      const store = new LockfileStore(projectRoot);
      const first = Lockfile.of({
        presetName: PresetName.of('a'),
        artifacts: [],
        settings: Settings.empty(),
        instructions: Instructions.empty(),
      });
      const second = Lockfile.of({
        presetName: PresetName.of('b'),
        artifacts: [],
        settings: Settings.empty(),
        instructions: Instructions.empty(),
      });
      await store.write(first);
      await store.write(second);

      const onDisk = await readFile(join(projectRoot, '.claude-fw.lock.json'), 'utf-8');
      expect(JSON.parse(onDisk).presetName).toBe('b');
    });
  });

  it('round-trips: write then read returns equivalent data', async () => {
    const store = new LockfileStore(projectRoot);
    const original = Lockfile.of({
      presetName: PresetName.of('nestjs'),
      artifacts: [
        {
          ref: ArtifactRef.agent(AgentId.of('agent-1')),
          contentHash: ContentHash.of('content-1'),
        },
      ],
      settings: Settings.of({ allow: ['Bash(ls)'] }),
      instructions: Instructions.empty(),
    });
    await store.write(original);
    const restored = await store.read();

    expect(restored?.presetName.toString()).toBe('nestjs');
    expect(restored?.artifacts.map((a) => a.ref.id.toString())).toEqual(['agent-1']);
    expect(restored?.settings.permissions.allow).toEqual(['Bash(ls)']);
  });
});
