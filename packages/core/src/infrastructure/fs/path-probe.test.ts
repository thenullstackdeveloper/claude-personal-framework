import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsPathProbe } from './path-probe.js';

describe('FsPathProbe', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cfw-probe-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports "directory" for an existing directory', async () => {
    await mkdir(join(root, 'presets'));
    const probe = new FsPathProbe();
    expect(await probe.inspect(root, 'presets')).toBe('directory');
  });

  it('reports "file" for an existing file', async () => {
    await writeFile(join(root, '.claude-fw.yaml'), 'preset: base', 'utf-8');
    const probe = new FsPathProbe();
    expect(await probe.inspect(root, '.claude-fw.yaml')).toBe('file');
  });

  it('reports "missing" when the path does not exist', async () => {
    const probe = new FsPathProbe();
    expect(await probe.inspect(root, 'nope')).toBe('missing');
  });

  it('reports "missing" for a broken symlink', async () => {
    await symlink(join(root, 'ghost'), join(root, 'dangling'));
    const probe = new FsPathProbe();
    expect(await probe.inspect(root, 'dangling')).toBe('missing');
  });

  it('joins base and segment without the caller composing paths', async () => {
    await mkdir(join(root, 'agents'));
    const probe = new FsPathProbe();
    expect(await probe.inspect(root, 'agents')).toBe('directory');
  });
});
