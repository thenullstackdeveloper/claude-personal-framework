import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GITIGNORE_END_MARKER,
  GITIGNORE_START_MARKER,
} from '../../domain/services/gitignore-block.js';
import { FsGitignore } from './fs-gitignore.js';

const ENTRIES = ['.claude/agents/', '.claude/skills/', '.githooks/'] as const;
const BLOCK = [GITIGNORE_START_MARKER, ...ENTRIES, GITIGNORE_END_MARKER].join('\n');

describe('FsGitignore', () => {
  let projectRoot: string;
  const gitignoreOf = (root: string) => join(root, '.gitignore');

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'cfw-gitignore-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('creates a fresh .gitignore when the file is missing', async () => {
    const adapter = new FsGitignore(projectRoot);
    const result = await adapter.ensureManagedBlock(ENTRIES);
    expect(result.status).toBe('created');
    expect(result.path).toBe(gitignoreOf(projectRoot));
    const content = await readFile(gitignoreOf(projectRoot), 'utf-8');
    expect(content).toBe(`${BLOCK}\n`);
  });

  it('is a no-op when the block already matches byte-for-byte (mtime preserved)', async () => {
    const existing = `node_modules/\n\n${BLOCK}\n`;
    await writeFile(gitignoreOf(projectRoot), existing);
    const before = await stat(gitignoreOf(projectRoot));

    const adapter = new FsGitignore(projectRoot);
    const result = await adapter.ensureManagedBlock(ENTRIES);

    expect(result.status).toBe('unchanged');
    const after = await stat(gitignoreOf(projectRoot));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const content = await readFile(gitignoreOf(projectRoot), 'utf-8');
    expect(content).toBe(existing);
  });

  it('replaces a stale block atomically and leaves lines outside the markers untouched', async () => {
    const staleBlock = [GITIGNORE_START_MARKER, '.claude/old/', GITIGNORE_END_MARKER].join('\n');
    const existing = `# user comment\nnode_modules/\n\n${staleBlock}\n\ndist/\n`;
    await writeFile(gitignoreOf(projectRoot), existing);

    const adapter = new FsGitignore(projectRoot);
    const result = await adapter.ensureManagedBlock(ENTRIES);

    expect(result.status).toBe('updated');
    const content = await readFile(gitignoreOf(projectRoot), 'utf-8');
    expect(content).toBe(`# user comment\nnode_modules/\n\n${BLOCK}\n\ndist/\n`);
  });

  it('appends the block when no markers are present', async () => {
    await writeFile(gitignoreOf(projectRoot), 'node_modules/\n');
    const adapter = new FsGitignore(projectRoot);
    const result = await adapter.ensureManagedBlock(ENTRIES);

    expect(result.status).toBe('updated');
    const content = await readFile(gitignoreOf(projectRoot), 'utf-8');
    expect(content).toBe(`node_modules/\n\n${BLOCK}\n`);
  });

  it('returns block-conflict and does not write when two pairs of markers are present', async () => {
    const existing = `${BLOCK}\n\n${BLOCK}\n`;
    await writeFile(gitignoreOf(projectRoot), existing);
    const before = await stat(gitignoreOf(projectRoot));

    const adapter = new FsGitignore(projectRoot);
    const result = await adapter.ensureManagedBlock(ENTRIES);

    expect(result.status).toBe('block-conflict');
    const after = await stat(gitignoreOf(projectRoot));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const content = await readFile(gitignoreOf(projectRoot), 'utf-8');
    expect(content).toBe(existing);
  });

  it('follows a symlinked .gitignore via realpath and writes to the target', async () => {
    // Create the real file outside the project root, then symlink it as
    // the project's `.gitignore`. The adapter should resolve and write
    // the real file, not the link.
    const realDir = await mkdtemp(join(tmpdir(), 'cfw-gitignore-real-'));
    try {
      const realPath = join(realDir, 'shared.gitignore');
      await writeFile(realPath, 'node_modules/\n');
      await symlink(realPath, gitignoreOf(projectRoot));

      const adapter = new FsGitignore(projectRoot);
      const result = await adapter.ensureManagedBlock(ENTRIES);

      expect(result.status).toBe('updated');
      expect(result.path).toBe(realPath);
      const content = await readFile(realPath, 'utf-8');
      expect(content).toBe(`node_modules/\n\n${BLOCK}\n`);
    } finally {
      await rm(realDir, { recursive: true, force: true });
    }
  });
});
