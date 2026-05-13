import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from '../../domain/model/agent.js';
import { Command } from '../../domain/model/command.js';
import { AgentId, CommandId, SkillId } from '../../domain/model/identifiers.js';
import { Skill } from '../../domain/model/skill.js';
import { ClaudeWriter } from './claude-writer.js';

describe('ClaudeWriter', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cfw-project-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const claudePath = (...parts: string[]) => join(projectRoot, '.claude', ...parts);

  describe('writeAgent', () => {
    it('creates .claude/agents/ if missing and writes the markdown', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('docs-manager'), 'agent body'));
      const content = await readFile(claudePath('agents', 'docs-manager.md'), 'utf-8');
      expect(content).toBe('agent body');
    });

    it('overwrites an existing agent file', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('a'), 'v1'));
      await writer.writeAgent(Agent.of(AgentId.of('a'), 'v2'));
      const content = await readFile(claudePath('agents', 'a.md'), 'utf-8');
      expect(content).toBe('v2');
    });
  });

  describe('writeSkill / writeCommand', () => {
    it('writes a skill to .claude/skills/', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeSkill(Skill.of(SkillId.of('hexagonal-rn'), 'skill body'));
      const content = await readFile(claudePath('skills', 'hexagonal-rn.md'), 'utf-8');
      expect(content).toBe('skill body');
    });

    it('writes a command to .claude/commands/', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeCommand(Command.of(CommandId.of('build-android'), 'cmd body'));
      const content = await readFile(claudePath('commands', 'build-android.md'), 'utf-8');
      expect(content).toBe('cmd body');
    });
  });

  describe('cleanArtifacts', () => {
    it('removes agents/, skills/ and commands/ subdirectories', async () => {
      await mkdir(claudePath('agents'), { recursive: true });
      await mkdir(claudePath('skills'), { recursive: true });
      await mkdir(claudePath('commands'), { recursive: true });
      await writeFile(claudePath('agents', 'a.md'), 'x');
      await writeFile(claudePath('skills', 's.md'), 'x');
      await writeFile(claudePath('commands', 'c.md'), 'x');

      const writer = new ClaudeWriter(projectRoot);
      await writer.cleanArtifacts();

      await expect(readdir(claudePath('agents'))).rejects.toThrow();
      await expect(readdir(claudePath('skills'))).rejects.toThrow();
      await expect(readdir(claudePath('commands'))).rejects.toThrow();
    });

    it('is a no-op when nothing exists', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await expect(writer.cleanArtifacts()).resolves.toBeUndefined();
    });

    it('does not touch other files in .claude/', async () => {
      await mkdir(claudePath(), { recursive: true });
      await writeFile(claudePath('settings.local.json'), '{}');
      const writer = new ClaudeWriter(projectRoot);
      await writer.cleanArtifacts();
      const content = await readFile(claudePath('settings.local.json'), 'utf-8');
      expect(content).toBe('{}');
    });
  });
});
