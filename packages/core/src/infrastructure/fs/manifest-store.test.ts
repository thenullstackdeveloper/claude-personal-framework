import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { AgentId, PresetName } from '../../domain/model/identifiers.js';
import { Override } from '../../domain/model/override.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';
import { FsManifestStore } from './manifest-store.js';

describe('FsManifestStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cfw-manifest-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const manifestPath = () => join(root, '.claude-fw.yaml');

  describe('read', () => {
    it('returns null when the manifest file does not exist', async () => {
      const store = new FsManifestStore(root);
      expect(await store.read()).toBeNull();
    });

    it('returns the parsed manifest when the file exists', async () => {
      await writeFile(manifestPath(), 'preset: nestjs\n', 'utf-8');
      const store = new FsManifestStore(root);
      const manifest = await store.read();
      expect(manifest?.presetName.toString()).toBe('nestjs');
      expect(manifest?.overrides).toEqual([]);
    });

    it('parses a manifest with overrides', async () => {
      const yaml = [
        'preset: base',
        'overrides:',
        '  - disable: agent:foo',
        '  - add: skill:bar',
      ].join('\n');
      await writeFile(manifestPath(), yaml, 'utf-8');

      const store = new FsManifestStore(root);
      const manifest = await store.read();
      expect(manifest?.overrides).toHaveLength(2);
      expect(manifest?.overrides[0]?.kind).toBe('disable');
      expect(manifest?.overrides[1]?.kind).toBe('add');
    });
  });

  describe('write', () => {
    it('creates the manifest file when none exists', async () => {
      const store = new FsManifestStore(root);
      const manifest: ProjectManifest = {
        presetName: PresetName.of('nestjs'),
        overrides: [],
      };

      await store.write(manifest);

      const onDisk = await readFile(manifestPath(), 'utf-8');
      expect(onDisk).toContain('preset: nestjs');
    });

    it('overwrites an existing manifest file', async () => {
      await writeFile(manifestPath(), 'preset: old\n', 'utf-8');
      const store = new FsManifestStore(root);

      await store.write({
        presetName: PresetName.of('new'),
        overrides: [],
      });

      const onDisk = await readFile(manifestPath(), 'utf-8');
      expect(onDisk).toContain('preset: new');
      expect(onDisk).not.toContain('preset: old');
    });

    it('serializes overrides when present', async () => {
      const store = new FsManifestStore(root);
      await store.write({
        presetName: PresetName.of('base'),
        overrides: [Override.disable(ArtifactRef.agent(AgentId.of('drop')))],
      });

      const onDisk = await readFile(manifestPath(), 'utf-8');
      expect(onDisk).toContain('overrides:');
      expect(onDisk).toContain('disable: agent:drop');
    });
  });

  describe('round-trip', () => {
    it('write then read returns an equivalent manifest', async () => {
      const original: ProjectManifest = {
        presetName: PresetName.of('nestjs'),
        overrides: [
          Override.disable(ArtifactRef.agent(AgentId.of('foo'))),
          Override.add(ArtifactRef.agent(AgentId.of('bar'))),
        ],
      };

      const store = new FsManifestStore(root);
      await store.write(original);
      const restored = await store.read();

      expect(restored?.presetName.toString()).toBe('nestjs');
      expect(restored?.overrides.map((o) => o.kind)).toEqual(['disable', 'add']);
    });
  });
});
