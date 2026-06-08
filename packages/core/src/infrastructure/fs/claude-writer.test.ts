import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from '../../domain/model/agent.js';
import { Command } from '../../domain/model/command.js';
import { GitHook } from '../../domain/model/git-hook.js';
import { AgentId, CommandId, HookName, SkillId } from '../../domain/model/identifiers.js';
import { Instructions } from '../../domain/model/instructions.js';
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

  describe('writeInstructions / deleteInstructions', () => {
    it('writes the content verbatim to .claude/CLAUDE.md', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeInstructions(Instructions.of('# project\n\nhello'));
      const content = await readFile(claudePath('CLAUDE.md'), 'utf-8');
      expect(content).toBe('# project\n\nhello');
    });

    it('overwrites an existing CLAUDE.md', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeInstructions(Instructions.of('first'));
      await writer.writeInstructions(Instructions.of('second'));
      const content = await readFile(claudePath('CLAUDE.md'), 'utf-8');
      expect(content).toBe('second');
    });

    it('deleteInstructions removes the file', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeInstructions(Instructions.of('x'));
      await writer.deleteInstructions();
      await expect(stat(claudePath('CLAUDE.md'))).rejects.toThrow();
    });

    it('deleteInstructions is idempotent (ENOENT swallowed)', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await expect(writer.deleteInstructions()).resolves.toBeUndefined();
    });
  });

  describe('writeGitHook / deleteGitHook', () => {
    const hookPath = (name: string) => join(projectRoot, '.githooks', name);

    it('creates .githooks/ outside .claude/ and writes the hook content', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeGitHook(GitHook.of(HookName.of('commit-msg'), '#!/bin/sh\nexit 0\n'));
      const content = await readFile(hookPath('commit-msg'), 'utf-8');
      expect(content).toBe('#!/bin/sh\nexit 0\n');
    });

    it('sets the executable bit (0o755) on POSIX', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeGitHook(GitHook.of(HookName.of('pre-commit'), '#!/bin/sh'));
      const st = await stat(hookPath('pre-commit'));
      // Skip the mode assertion on Windows — NTFS has no POSIX exec bit
      // and chmod is a no-op there. Intentional, see writeGitHook.
      if (process.platform !== 'win32') {
        expect(st.mode & 0o777).toBe(0o755);
      }
    });

    it('overwrites an existing hook file', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeGitHook(GitHook.of(HookName.of('pre-push'), 'v1'));
      await writer.writeGitHook(GitHook.of(HookName.of('pre-push'), 'v2'));
      const content = await readFile(hookPath('pre-push'), 'utf-8');
      expect(content).toBe('v2');
    });

    it('deleteGitHook removes the file', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await writer.writeGitHook(GitHook.of(HookName.of('commit-msg'), 'x'));
      await writer.deleteGitHook(HookName.of('commit-msg'));
      await expect(stat(hookPath('commit-msg'))).rejects.toThrow();
    });

    it('deleteGitHook is idempotent (ENOENT swallowed)', async () => {
      const writer = new ClaudeWriter(projectRoot);
      await expect(writer.deleteGitHook(HookName.of('pre-push'))).resolves.toBeUndefined();
    });
  });
});
