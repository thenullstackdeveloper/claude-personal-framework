import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

  describe('writeAgent / writeSkill / writeCommand', () => {
    it('creates .claude/agents/ if missing and writes the markdown', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('docs-manager'), 'agent body'));
      const content = await readFile(claudePath('agents', 'docs-manager.md'), 'utf-8');
      expect(content).toBe('agent body');
    });

    it('overwrites an existing artifact file', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('a'), 'v1'));
      await writer.writeAgent(Agent.of(AgentId.of('a'), 'v2'));
      const content = await readFile(claudePath('agents', 'a.md'), 'utf-8');
      expect(content).toBe('v2');
    });

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

  describe('deleteAgent / deleteSkill / deleteCommand', () => {
    it('removes the agent file by id', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('to-delete'), 'x'));
      await writer.deleteAgent(AgentId.of('to-delete'));
      await expect(stat(claudePath('agents', 'to-delete.md'))).rejects.toThrow();
    });

    it('is a no-op when the file does not exist (ENOENT swallowed)', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await expect(writer.deleteAgent(AgentId.of('never-was'))).resolves.toBeUndefined();
    });

    it('does not touch other agents in the same directory', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('keep'), 'k'));
      await writer.writeAgent(Agent.of(AgentId.of('drop'), 'd'));
      await writer.deleteAgent(AgentId.of('drop'));
      const kept = await readFile(claudePath('agents', 'keep.md'), 'utf-8');
      expect(kept).toBe('k');
    });

    it('deletes a skill', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeSkill(Skill.of(SkillId.of('foo'), 'x'));
      await writer.deleteSkill(SkillId.of('foo'));
      await expect(stat(claudePath('skills', 'foo.md'))).rejects.toThrow();
    });

    it('deletes a command', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeCommand(Command.of(CommandId.of('foo'), 'x'));
      await writer.deleteCommand(CommandId.of('foo'));
      await expect(stat(claudePath('commands', 'foo.md'))).rejects.toThrow();
    });

    it('leaves unrelated files in .claude/ untouched', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeAgent(Agent.of(AgentId.of('a'), 'x'));
      await writeFile(claudePath('settings.local.json'), '{}');
      await writer.deleteAgent(AgentId.of('a'));
      const settings = await readFile(claudePath('settings.local.json'), 'utf-8');
      expect(settings).toBe('{}');
    });
  });
});
