import { describe, expect, it } from 'vitest';
import { PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import type { Agent } from '../../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../../domain/model/artifact-summary.js';
import type { Command } from '../../../domain/model/command.js';
import { PresetName } from '../../../domain/model/identifiers.js';
import type { Instructions } from '../../../domain/model/instructions.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import type { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort, ManifestStorePort } from '../../ports/index.js';
import { ManifestAlreadyExistsError } from './errors.js';
import { initProject } from './init-project.use-case.js';

class StubCatalog implements CatalogPort {
  constructor(private readonly presets: readonly Preset[]) {}
  async listPresets(): Promise<readonly Preset[]> {
    return this.presets;
  }
  async listAgents(): Promise<readonly AgentSummary[]> {
    return [];
  }
  async listSkills(): Promise<readonly SkillSummary[]> {
    return [];
  }
  async listCommands(): Promise<readonly CommandSummary[]> {
    return [];
  }
  async listInstructions(): Promise<readonly InstructionsSummary[]> {
    return [];
  }
  async readAgent(): Promise<Agent> {
    throw new Error('not used');
  }
  async readSkill(): Promise<Skill> {
    throw new Error('not used');
  }
  async readCommand(): Promise<Command> {
    throw new Error('not used');
  }
  async readInstructions(): Promise<Instructions> {
    throw new Error('not used');
  }
}

class InMemoryManifestStore implements ManifestStorePort {
  current: ProjectManifest | null = null;
  writeCalls = 0;

  async read(): Promise<ProjectManifest | null> {
    return this.current;
  }

  async write(manifest: ProjectManifest): Promise<void> {
    this.current = manifest;
    this.writeCalls++;
  }
}

const presetCatalog = (...names: string[]) =>
  new StubCatalog(names.map((n) => Preset.of({ name: PresetName.of(n) })));

describe('initProject use case', () => {
  it('writes a manifest with the chosen preset and empty overrides', async () => {
    const catalog = presetCatalog('base', 'nestjs');
    const manifestStore = new InMemoryManifestStore();

    const result = await initProject({
      presetName: PresetName.of('nestjs'),
      catalog,
      manifestStore,
    });

    expect(result.manifest.presetName.toString()).toBe('nestjs');
    expect(result.manifest.overrides).toEqual([]);
    expect(manifestStore.current).not.toBeNull();
    expect(manifestStore.current?.presetName.toString()).toBe('nestjs');
    expect(manifestStore.writeCalls).toBe(1);
  });

  it('throws ManifestAlreadyExistsError when a manifest is already present', async () => {
    const catalog = presetCatalog('base');
    const manifestStore = new InMemoryManifestStore();
    manifestStore.current = {
      presetName: PresetName.of('base'),
      overrides: [],
    };

    await expect(
      initProject({ presetName: PresetName.of('base'), catalog, manifestStore }),
    ).rejects.toThrow(ManifestAlreadyExistsError);

    // Does not overwrite
    expect(manifestStore.writeCalls).toBe(0);
  });

  it('throws PresetNotFoundError when the preset is not in the catalog', async () => {
    const catalog = presetCatalog('base');
    const manifestStore = new InMemoryManifestStore();

    await expect(
      initProject({ presetName: PresetName.of('nope'), catalog, manifestStore }),
    ).rejects.toThrow(PresetNotFoundError);

    expect(manifestStore.writeCalls).toBe(0);
    expect(manifestStore.current).toBeNull();
  });

  it('checks manifest existence before checking the catalog', async () => {
    // If both checks would fail, the existence error takes priority because the
    // user can't init this project regardless of the preset they chose.
    const catalog = presetCatalog('base');
    const manifestStore = new InMemoryManifestStore();
    manifestStore.current = {
      presetName: PresetName.of('base'),
      overrides: [],
    };

    await expect(
      initProject({ presetName: PresetName.of('nope'), catalog, manifestStore }),
    ).rejects.toThrow(ManifestAlreadyExistsError);
  });

  it('passes through with multiple presets in the catalog', async () => {
    const catalog = presetCatalog('base', 'nestjs', 'react-native');
    const manifestStore = new InMemoryManifestStore();

    await initProject({
      presetName: PresetName.of('react-native'),
      catalog,
      manifestStore,
    });

    expect(manifestStore.current?.presetName.toString()).toBe('react-native');
  });
});
