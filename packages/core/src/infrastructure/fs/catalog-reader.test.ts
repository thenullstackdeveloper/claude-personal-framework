import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError } from '../../domain/errors/domain-error.js';
import { AgentId, CommandId, SkillId } from '../../domain/model/identifiers.js';
import { CatalogReader } from './catalog-reader.js';

describe('CatalogReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cfw-catalog-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeFileAt = async (rel: string, content: string): Promise<void> => {
    const full = join(root, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  };

  describe('listPresets', () => {
    it('returns an empty list when the presets directory does not exist', async () => {
      const reader = new CatalogReader(root);
      const presets = await reader.listPresets();
      expect(presets).toEqual([]);
    });

    it('lists every yaml file in presets/ as a Preset', async () => {
      await writeFileAt('presets/base.yaml', 'agents: [docs-manager]');
      await writeFileAt('presets/react-native.yaml', 'extends: base\nagents: [pr-creator]');
      const reader = new CatalogReader(root);
      const presets = await reader.listPresets();

      expect(presets.map((p) => p.name.toString()).sort()).toEqual(['base', 'react-native']);
      const rn = presets.find((p) => p.name.toString() === 'react-native');
      expect(rn?.extends_.map(String)).toEqual(['base']);
      expect(rn?.agentIds.map(String)).toEqual(['pr-creator']);
    });

    it('ignores non-yaml files in presets/', async () => {
      await writeFileAt('presets/base.yaml', '');
      await writeFileAt('presets/README.md', 'docs');
      const reader = new CatalogReader(root);
      const presets = await reader.listPresets();
      expect(presets).toHaveLength(1);
    });
  });

  describe('readAgent', () => {
    it('returns an Agent with the markdown content and computed hash', async () => {
      await writeFileAt('agents/docs-manager.md', 'agent body');
      const reader = new CatalogReader(root);
      const agent = await reader.readAgent(AgentId.of('docs-manager'));
      expect(agent.id.toString()).toBe('docs-manager');
      expect(agent.content).toBe('agent body');
      expect(agent.contentHash.toString()).toMatch(/^[a-f0-9]{64}$/);
    });

    it('throws ArtifactNotFoundError when the file is missing', async () => {
      const reader = new CatalogReader(root);
      await expect(reader.readAgent(AgentId.of('missing'))).rejects.toThrow(ArtifactNotFoundError);
    });
  });

  describe('readSkill', () => {
    it('returns a Skill with content', async () => {
      await writeFileAt('skills/hexagonal-rn.md', 'skill body');
      const reader = new CatalogReader(root);
      const skill = await reader.readSkill(SkillId.of('hexagonal-rn'));
      expect(skill.content).toBe('skill body');
    });

    it('throws ArtifactNotFoundError for missing skill', async () => {
      const reader = new CatalogReader(root);
      await expect(reader.readSkill(SkillId.of('missing'))).rejects.toThrow(ArtifactNotFoundError);
    });
  });

  describe('readCommand', () => {
    it('returns a Command with content', async () => {
      await writeFileAt('commands/build-android.md', 'command body');
      const reader = new CatalogReader(root);
      const cmd = await reader.readCommand(CommandId.of('build-android'));
      expect(cmd.content).toBe('command body');
    });

    it('throws ArtifactNotFoundError for missing command', async () => {
      const reader = new CatalogReader(root);
      await expect(reader.readCommand(CommandId.of('missing'))).rejects.toThrow(
        ArtifactNotFoundError,
      );
    });
  });
});
