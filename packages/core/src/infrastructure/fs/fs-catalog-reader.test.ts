import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError } from '../../domain/errors/domain-error.js';
import {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  SkillId,
} from '../../domain/model/identifiers.js';
import { FsCatalogReader } from './fs-catalog-reader.js';

describe('FsCatalogReader', () => {
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
      const reader = new FsCatalogReader(root);
      const presets = await reader.listPresets();
      expect(presets).toEqual([]);
    });

    it('lists every yaml file in presets/ as a Preset', async () => {
      await writeFileAt('presets/base.yaml', 'agents: [docs-manager]');
      await writeFileAt('presets/react-native.yaml', 'extends: base\nagents: [pr-creator]');
      const reader = new FsCatalogReader(root);
      const presets = await reader.listPresets();

      expect(presets.map((p) => p.name.toString()).sort()).toEqual(['base', 'react-native']);
      const rn = presets.find((p) => p.name.toString() === 'react-native');
      expect(rn?.extends_.map(String)).toEqual(['base']);
      expect(rn?.agentIds.map(String)).toEqual(['pr-creator']);
    });

    it('ignores non-yaml files in presets/', async () => {
      await writeFileAt('presets/base.yaml', '');
      await writeFileAt('presets/README.md', 'docs');
      const reader = new FsCatalogReader(root);
      const presets = await reader.listPresets();
      expect(presets).toHaveLength(1);
    });
  });

  describe('readAgent', () => {
    it('returns an Agent with the markdown content and computed hash', async () => {
      await writeFileAt('agents/docs-manager.md', 'agent body');
      const reader = new FsCatalogReader(root);
      const agent = await reader.readAgent(AgentId.of('docs-manager'));
      expect(agent.id.toString()).toBe('docs-manager');
      expect(agent.content).toBe('agent body');
      expect(agent.contentHash.toString()).toMatch(/^[a-f0-9]{64}$/);
    });

    it('throws ArtifactNotFoundError when the file is missing', async () => {
      const reader = new FsCatalogReader(root);
      await expect(reader.readAgent(AgentId.of('missing'))).rejects.toThrow(ArtifactNotFoundError);
    });
  });

  describe('readSkill', () => {
    it('returns a Skill with content', async () => {
      await writeFileAt('skills/hexagonal-rn.md', 'skill body');
      const reader = new FsCatalogReader(root);
      const skill = await reader.readSkill(SkillId.of('hexagonal-rn'));
      expect(skill.content).toBe('skill body');
    });

    it('throws ArtifactNotFoundError for missing skill', async () => {
      const reader = new FsCatalogReader(root);
      await expect(reader.readSkill(SkillId.of('missing'))).rejects.toThrow(ArtifactNotFoundError);
    });
  });

  describe('readCommand', () => {
    it('returns a Command with content', async () => {
      await writeFileAt('commands/build-android.md', 'command body');
      const reader = new FsCatalogReader(root);
      const cmd = await reader.readCommand(CommandId.of('build-android'));
      expect(cmd.content).toBe('command body');
    });

    it('throws ArtifactNotFoundError for missing command', async () => {
      const reader = new FsCatalogReader(root);
      await expect(reader.readCommand(CommandId.of('missing'))).rejects.toThrow(
        ArtifactNotFoundError,
      );
    });
  });

  describe('readInstructions', () => {
    it('returns Instructions with the file content verbatim', async () => {
      await writeFileAt('instructions/intro.md', 'Some plain instructions.\n');
      const reader = new FsCatalogReader(root);
      const out = await reader.readInstructions(InstructionsId.of('intro'));
      expect(out.content).toBe('Some plain instructions.\n');
      expect(out.isEmpty()).toBe(false);
    });

    it('throws ArtifactNotFoundError when missing', async () => {
      const reader = new FsCatalogReader(root);
      await expect(reader.readInstructions(InstructionsId.of('missing'))).rejects.toThrow(
        ArtifactNotFoundError,
      );
    });
  });

  describe('listInstructions', () => {
    it('returns empty when the directory does not exist', async () => {
      const reader = new FsCatalogReader(root);
      expect(await reader.listInstructions()).toEqual([]);
    });

    it('lists instructions files with empty description (no frontmatter)', async () => {
      await writeFileAt('instructions/intro.md', 'plain body');
      await writeFileAt('instructions/conventions.md', 'more body');
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listInstructions();
      expect(summaries.map((s) => s.id.toString()).sort()).toEqual(['conventions', 'intro']);
      for (const s of summaries) expect(s.description).toBe('');
    });
  });

  describe('listAgents / listSkills / listCommands', () => {
    it('returns empty arrays when the directories do not exist', async () => {
      const reader = new FsCatalogReader(root);
      expect(await reader.listAgents()).toEqual([]);
      expect(await reader.listSkills()).toEqual([]);
      expect(await reader.listCommands()).toEqual([]);
    });

    it('lists agents with their frontmatter description', async () => {
      await writeFileAt(
        'agents/docs-manager.md',
        '---\nname: docs-manager\ndescription: Manages docs.\n---\n\nbody',
      );
      await writeFileAt(
        'agents/pr-creator.md',
        '---\nname: pr-creator\ndescription: Creates PRs.\n---\n\nbody',
      );
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listAgents();
      const byId = Object.fromEntries(summaries.map((s) => [s.id.toString(), s.description]));
      expect(byId).toEqual({
        'docs-manager': 'Manages docs.',
        'pr-creator': 'Creates PRs.',
      });
    });

    it('returns empty description when an agent has no frontmatter', async () => {
      await writeFileAt('agents/plain.md', 'just a body, no frontmatter');
      const reader = new FsCatalogReader(root);
      const [summary] = await reader.listAgents();
      expect(summary?.id.toString()).toBe('plain');
      expect(summary?.description).toBe('');
    });

    it('skips files that are not valid slugs', async () => {
      await writeFileAt('agents/Valid-Looking.md', 'x');
      await writeFileAt('agents/valid-one.md', 'x');
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listAgents();
      expect(summaries.map((s) => s.id.toString())).toEqual(['valid-one']);
    });

    it('ignores non-md files', async () => {
      await writeFileAt('agents/foo.md', 'x');
      await writeFileAt('agents/README.txt', 'docs');
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listAgents();
      expect(summaries).toHaveLength(1);
    });

    it('listSkills works the same way', async () => {
      await writeFileAt('skills/nestjs-hex.md', '---\ndescription: NestJS hexagonal.\n---\nbody');
      const reader = new FsCatalogReader(root);
      const [summary] = await reader.listSkills();
      expect(summary?.id.toString()).toBe('nestjs-hex');
      expect(summary?.description).toBe('NestJS hexagonal.');
    });

    it('listCommands works the same way', async () => {
      await writeFileAt('commands/build-android.md', '---\ndescription: Build Android.\n---\nbody');
      const reader = new FsCatalogReader(root);
      const [summary] = await reader.listCommands();
      expect(summary?.id.toString()).toBe('build-android');
      expect(summary?.description).toBe('Build Android.');
    });
  });

  describe('listGitHooks', () => {
    it('returns empty when git-hooks/ does not exist', async () => {
      const reader = new FsCatalogReader(root);
      expect(await reader.listGitHooks()).toEqual([]);
    });

    it('lists files whose name matches the closed HookName enum', async () => {
      await writeFileAt('git-hooks/commit-msg', '#!/bin/sh');
      await writeFileAt('git-hooks/pre-commit', '#!/bin/sh');
      await writeFileAt('git-hooks/pre-push', '#!/bin/sh');
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listGitHooks();
      expect(summaries.map((s) => s.hookName).sort()).toEqual([
        'commit-msg',
        'pre-commit',
        'pre-push',
      ]);
    });

    it('silently skips files outside the closed enum', async () => {
      await writeFileAt('git-hooks/commit-msg', '#!/bin/sh');
      await writeFileAt('git-hooks/pre-rebase', '#!/bin/sh'); // not in MVP enum
      await writeFileAt('git-hooks/README.md', 'docs');
      const reader = new FsCatalogReader(root);
      const summaries = await reader.listGitHooks();
      expect(summaries.map((s) => s.hookName)).toEqual(['commit-msg']);
    });
  });

  describe('readGitHook', () => {
    it('returns a GitHook with file content verbatim', async () => {
      await writeFileAt('git-hooks/commit-msg', '#!/bin/sh\nexit 0\n');
      const reader = new FsCatalogReader(root);
      const hook = await reader.readGitHook(HookName.of('commit-msg'));
      expect(hook.hookName).toBe('commit-msg');
      expect(hook.content).toBe('#!/bin/sh\nexit 0\n');
    });

    it('throws ArtifactNotFoundError when the hook file is missing', async () => {
      const reader = new FsCatalogReader(root);
      await expect(reader.readGitHook(HookName.of('pre-push'))).rejects.toThrow(
        ArtifactNotFoundError,
      );
    });
  });
});
