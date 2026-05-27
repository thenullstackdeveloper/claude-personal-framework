import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
