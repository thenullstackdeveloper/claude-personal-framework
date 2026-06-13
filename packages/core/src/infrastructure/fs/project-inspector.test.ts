import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HookName } from '../../domain/model/identifiers.js';
import { LocalProjectInspector } from './project-inspector.js';

describe('LocalProjectInspector', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cfw-inspect-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe('claudeMdExists', () => {
    it('returns false when .claude/ does not exist', async () => {
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(false);
    });

    it('returns false when .claude/ exists but CLAUDE.md does not', async () => {
      await mkdir(join(projectRoot, '.claude'), { recursive: true });
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(false);
    });

    it('returns true when .claude/CLAUDE.md is present', async () => {
      await mkdir(join(projectRoot, '.claude'), { recursive: true });
      await writeFile(join(projectRoot, '.claude', 'CLAUDE.md'), 'anything', 'utf-8');
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(true);
    });
  });

  describe('gitHookExists', () => {
    it('returns false when .githooks/ does not exist', async () => {
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('commit-msg'))).toBe(false);
    });

    it('returns false when .githooks/ exists but the specific hook does not', async () => {
      await mkdir(join(projectRoot, '.githooks'), { recursive: true });
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('pre-push'))).toBe(false);
    });

    it('returns true when .githooks/<hookName> is present', async () => {
      await mkdir(join(projectRoot, '.githooks'), { recursive: true });
      await writeFile(join(projectRoot, '.githooks', 'commit-msg'), '#!/bin/sh', 'utf-8');
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('commit-msg'))).toBe(true);
    });
  });

  describe('isGitRepo', () => {
    it('returns false when the project root is not a git working tree', async () => {
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.isGitRepo()).toBe(false);
    });

    it('returns true after `git init` in the project root', async () => {
      await runGit(['init', '-q'], projectRoot);
      const inspector = new LocalProjectInspector(projectRoot);
      expect(await inspector.isGitRepo()).toBe(true);
    });
  });
});

const runGit = (args: readonly string[], cwd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} failed (exit ${code})`)),
    );
  });
