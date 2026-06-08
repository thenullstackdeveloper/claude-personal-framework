import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HookName } from '../../domain/model/identifiers.js';
import { FsProjectInspector } from './project-inspector.js';

describe('FsProjectInspector', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cfw-inspect-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe('claudeMdExists', () => {
    it('returns false when .claude/ does not exist', async () => {
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(false);
    });

    it('returns false when .claude/ exists but CLAUDE.md does not', async () => {
      await mkdir(join(projectRoot, '.claude'), { recursive: true });
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(false);
    });

    it('returns true when .claude/CLAUDE.md is present', async () => {
      await mkdir(join(projectRoot, '.claude'), { recursive: true });
      await writeFile(join(projectRoot, '.claude', 'CLAUDE.md'), 'anything', 'utf-8');
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.claudeMdExists()).toBe(true);
    });
  });

  describe('gitHookExists', () => {
    it('returns false when .githooks/ does not exist', async () => {
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('commit-msg'))).toBe(false);
    });

    it('returns false when .githooks/ exists but the specific hook does not', async () => {
      await mkdir(join(projectRoot, '.githooks'), { recursive: true });
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('pre-push'))).toBe(false);
    });

    it('returns true when .githooks/<hookName> is present', async () => {
      await mkdir(join(projectRoot, '.githooks'), { recursive: true });
      await writeFile(join(projectRoot, '.githooks', 'commit-msg'), '#!/bin/sh', 'utf-8');
      const inspector = new FsProjectInspector(projectRoot);
      expect(await inspector.gitHookExists(HookName.of('commit-msg'))).toBe(true);
    });
  });
});
