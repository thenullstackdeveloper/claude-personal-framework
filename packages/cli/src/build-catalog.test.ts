import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoCatalogSourceError, buildCatalogPort } from './build-catalog.js';

describe('buildCatalogPort', () => {
  let folderA: string;
  let folderB: string;
  let folderEnv: string;
  let folderLegacy: string;

  beforeEach(async () => {
    folderA = await mkdtemp(join(tmpdir(), 'cfw-build-a-'));
    folderB = await mkdtemp(join(tmpdir(), 'cfw-build-b-'));
    folderEnv = await mkdtemp(join(tmpdir(), 'cfw-build-env-'));
    folderLegacy = await mkdtemp(join(tmpdir(), 'cfw-build-legacy-'));
  });

  afterEach(async () => {
    await rm(folderA, { recursive: true, force: true });
    await rm(folderB, { recursive: true, force: true });
    await rm(folderEnv, { recursive: true, force: true });
    await rm(folderLegacy, { recursive: true, force: true });
  });

  const seedPreset = async (root: string, name: string, body = ''): Promise<void> => {
    await mkdir(join(root, 'presets'), { recursive: true });
    await writeFile(join(root, 'presets', `${name}.yaml`), body, 'utf-8');
  };

  it('throws NoCatalogSourceError when no catalog source is configured', () => {
    const call = () =>
      buildCatalogPort({
        catalogFolders: [],
        env: {},
        allowBuiltin: true,
      });
    expect(call).toThrow(NoCatalogSourceError);
    expect(call).toThrow(/No catalog source configured/);
  });

  it('returns a single FsCatalogReader when only one --catalog-folder is given', async () => {
    await seedPreset(folderA, 'base');
    const catalog = buildCatalogPort({
      catalogFolders: [folderA],
      env: {},
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets.map((p) => String(p.name))).toEqual(['base']);
  });

  it('accepts the legacy --framework flag as a folder source', async () => {
    await seedPreset(folderLegacy, 'legacy-base');
    const catalog = buildCatalogPort({
      frameworkFlag: folderLegacy,
      catalogFolders: [],
      env: {},
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets.map((p) => String(p.name))).toEqual(['legacy-base']);
  });

  it('aggregates multiple --catalog-folder flags with first-given precedence', async () => {
    await seedPreset(folderA, 'shared', 'agents: [from-a]');
    await seedPreset(folderB, 'shared', 'agents: [from-b]');
    const catalog = buildCatalogPort({
      catalogFolders: [folderA, folderB],
      env: {},
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]?.agentIds.map(String)).toEqual(['from-a']);
  });

  it('lets CFW_CATALOG_PATH win over --catalog-folder', async () => {
    await seedPreset(folderEnv, 'shared', 'agents: [from-env]');
    await seedPreset(folderA, 'shared', 'agents: [from-flag]');
    const catalog = buildCatalogPort({
      catalogFolders: [folderA],
      env: { CFW_CATALOG_PATH: folderEnv },
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]?.agentIds.map(String)).toEqual(['from-env']);
  });

  it('lets --catalog-folder win over the legacy --framework flag', async () => {
    await seedPreset(folderA, 'shared', 'agents: [from-flag]');
    await seedPreset(folderLegacy, 'shared', 'agents: [from-legacy]');
    const catalog = buildCatalogPort({
      frameworkFlag: folderLegacy,
      catalogFolders: [folderA],
      env: {},
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]?.agentIds.map(String)).toEqual(['from-flag']);
  });

  it('ignores CFW_CATALOG_PATH when set to an empty/whitespace string', async () => {
    await seedPreset(folderA, 'base');
    const catalog = buildCatalogPort({
      catalogFolders: [folderA],
      env: { CFW_CATALOG_PATH: '   ' },
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets.map((p) => String(p.name))).toEqual(['base']);
  });

  it('concatenates non-colliding presets across env, folder and legacy sources', async () => {
    await seedPreset(folderEnv, 'env-preset');
    await seedPreset(folderA, 'folder-preset');
    await seedPreset(folderLegacy, 'legacy-preset');
    const catalog = buildCatalogPort({
      frameworkFlag: folderLegacy,
      catalogFolders: [folderA],
      env: { CFW_CATALOG_PATH: folderEnv },
      allowBuiltin: true,
    });
    const presets = await catalog.listPresets();
    expect(presets.map((p) => String(p.name)).sort()).toEqual(
      ['env-preset', 'folder-preset', 'legacy-preset'].sort(),
    );
  });
});
