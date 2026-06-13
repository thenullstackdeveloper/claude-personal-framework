import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsStackInspector } from './fs-stack-inspector.js';

describe('FsStackInspector', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cfw-stack-inspect-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writePackageJson = async (content: unknown): Promise<void> => {
    await writeFile(join(root, 'package.json'), JSON.stringify(content), 'utf-8');
  };

  describe('dependencies', () => {
    it('returns empty list when package.json is missing', async () => {
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual([]);
    });

    it('reads package names from `dependencies`', async () => {
      await writePackageJson({ dependencies: { react: '^18', 'react-dom': '^18' } });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect([...result.dependencies].sort()).toEqual(['react', 'react-dom']);
    });

    it('reads package names from `peerDependencies`', async () => {
      await writePackageJson({ peerDependencies: { react: '*' } });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual(['react']);
    });

    it('merges and deduplicates `dependencies` + `peerDependencies`', async () => {
      await writePackageJson({
        dependencies: { react: '^18', 'state-lib': '^1' },
        peerDependencies: { react: '*', 'theme-lib': '^2' },
      });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect([...result.dependencies].sort()).toEqual(['react', 'state-lib', 'theme-lib']);
    });

    it('EXCLUDES `devDependencies` (CLAUDEPERS-28 acceptance)', async () => {
      await writePackageJson({
        dependencies: { 'real-dep': '^1' },
        devDependencies: { vitest: '^1', '@types/node': '^20' },
      });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual(['real-dep']);
      expect(result.dependencies).not.toContain('vitest');
      expect(result.dependencies).not.toContain('@types/node');
    });

    it('EXCLUDES `optionalDependencies` and other unknown sections', async () => {
      await writePackageJson({
        dependencies: { keep: '^1' },
        optionalDependencies: { 'fs-events': '^1' },
        bundledDependencies: ['x'],
      });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual(['keep']);
    });

    it('returns empty list when package.json is malformed JSON', async () => {
      await writeFile(join(root, 'package.json'), '{ not valid json', 'utf-8');
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual([]);
    });

    it('returns empty list when package.json has no dependency sections', async () => {
      await writePackageJson({ name: 'x', version: '1.0.0' });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual([]);
    });

    it('tolerates a dependencies field that is not an object', async () => {
      await writePackageJson({ dependencies: 'oops not an object' });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect(result.dependencies).toEqual([]);
    });
  });

  describe('files', () => {
    it('returns top-level entry names', async () => {
      await writeFile(join(root, 'README.md'), 'r', 'utf-8');
      await mkdir(join(root, 'src-tauri'), { recursive: true });
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(root);
      expect([...result.files].sort()).toEqual(['README.md', 'src-tauri']);
    });

    it('returns empty list when the project root does not exist', async () => {
      const inspector = new FsStackInspector();
      const result = await inspector.inspect(join(root, 'does-not-exist'));
      expect(result.files).toEqual([]);
      expect(result.dependencies).toEqual([]);
    });
  });

  it('returns both dependencies and files in a single inspection', async () => {
    await writePackageJson({ dependencies: { react: '^18' } });
    await mkdir(join(root, 'src-tauri'), { recursive: true });
    const inspector = new FsStackInspector();
    const result = await inspector.inspect(root);
    expect(result.dependencies).toEqual(['react']);
    expect(result.files).toContain('src-tauri');
    expect(result.files).toContain('package.json');
  });
});
