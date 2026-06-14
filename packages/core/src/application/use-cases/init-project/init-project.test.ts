import { describe, expect, it } from 'vitest';
import { PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import type { Agent } from '../../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  GitHookSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../../domain/model/artifact-summary.js';
import type { Command } from '../../../domain/model/command.js';
import type { GitHook } from '../../../domain/model/git-hook.js';
import { type HookName, PresetName } from '../../../domain/model/identifiers.js';
import type { Instructions } from '../../../domain/model/instructions.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import type { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort, ManifestStorePort, ProjectInspectorPort } from '../../ports/index.js';
import { ManifestAlreadyExistsError, NotAGitRepoError, ProjectDirMissingError } from './errors.js';
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
  async listGitHooks(): Promise<readonly GitHookSummary[]> {
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
  async readGitHook(_name: HookName): Promise<GitHook> {
    throw new Error('not used');
  }
}

class StubInspector implements ProjectInspectorPort {
  constructor(
    private gitRepo = true,
    private dirExists = true,
  ) {}
  setGitRepo(value: boolean): void {
    this.gitRepo = value;
  }
  setDirExists(value: boolean): void {
    this.dirExists = value;
  }
  async claudeMdExists(): Promise<boolean> {
    return false;
  }
  async gitHookExists(_name: HookName): Promise<boolean> {
    return false;
  }
  async isGitRepo(): Promise<boolean> {
    return this.gitRepo;
  }
  async projectDirExists(): Promise<boolean> {
    return this.dirExists;
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

const inputOf = (overrides: {
  presetName: PresetName;
  catalog: CatalogPort;
  manifestStore: ManifestStorePort;
  inspector?: ProjectInspectorPort;
  projectRoot?: string;
}) => ({
  presetName: overrides.presetName,
  projectRoot: overrides.projectRoot ?? '/tmp/p',
  catalog: overrides.catalog,
  manifestStore: overrides.manifestStore,
  inspector: overrides.inspector ?? new StubInspector(true),
});

describe('initProject use case', () => {
  it('writes a manifest with the chosen preset and empty overrides', async () => {
    const catalog = presetCatalog('base', 'nestjs');
    const manifestStore = new InMemoryManifestStore();

    const result = await initProject(
      inputOf({ presetName: PresetName.of('nestjs'), catalog, manifestStore }),
    );

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
      initProject(inputOf({ presetName: PresetName.of('base'), catalog, manifestStore })),
    ).rejects.toThrow(ManifestAlreadyExistsError);

    // Does not overwrite
    expect(manifestStore.writeCalls).toBe(0);
  });

  it('throws PresetNotFoundError when the preset is not in the catalog', async () => {
    const catalog = presetCatalog('base');
    const manifestStore = new InMemoryManifestStore();

    await expect(
      initProject(inputOf({ presetName: PresetName.of('nope'), catalog, manifestStore })),
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
      initProject(inputOf({ presetName: PresetName.of('nope'), catalog, manifestStore })),
    ).rejects.toThrow(ManifestAlreadyExistsError);
  });

  it('passes through with multiple presets in the catalog', async () => {
    const catalog = presetCatalog('base', 'nestjs', 'react-native');
    const manifestStore = new InMemoryManifestStore();

    await initProject(
      inputOf({ presetName: PresetName.of('react-native'), catalog, manifestStore }),
    );

    expect(manifestStore.current?.presetName.toString()).toBe('react-native');
  });

  describe('git repo guard', () => {
    it('throws NotAGitRepoError when the project root is not a git working tree', async () => {
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      const inspector = new StubInspector(false);

      await expect(
        initProject(
          inputOf({
            presetName: PresetName.of('base'),
            projectRoot: '/tmp/not-a-repo',
            catalog,
            manifestStore,
            inspector,
          }),
        ),
      ).rejects.toThrow(NotAGitRepoError);

      // Manifest never written.
      expect(manifestStore.writeCalls).toBe(0);
      expect(manifestStore.current).toBeNull();
    });

    it('attaches the projectRoot to NotAGitRepoError so callers can name it', async () => {
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      const inspector = new StubInspector(false);

      try {
        await initProject(
          inputOf({
            presetName: PresetName.of('base'),
            projectRoot: '/tmp/some-folder',
            catalog,
            manifestStore,
            inspector,
          }),
        );
        throw new Error('expected initProject to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(NotAGitRepoError);
        if (err instanceof NotAGitRepoError) {
          expect(err.projectRoot).toBe('/tmp/some-folder');
          expect(err.code).toBe('NOT_A_GIT_REPO');
        }
      }
    });

    it('runs the git-repo check before any other validation', async () => {
      // If the manifest already exists AND the preset is missing AND the
      // project is not a repo, NotAGitRepoError wins — there's no point
      // negotiating downstream conditions if the fundamental precondition
      // (a working tree) is missing.
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      manifestStore.current = {
        presetName: PresetName.of('base'),
        overrides: [],
      };
      const inspector = new StubInspector(false);

      await expect(
        initProject(
          inputOf({
            presetName: PresetName.of('nope'),
            catalog,
            manifestStore,
            inspector,
          }),
        ),
      ).rejects.toThrow(NotAGitRepoError);
    });
  });

  describe('project-dir guard', () => {
    it('throws ProjectDirMissingError when the project root does not exist on disk', async () => {
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      const inspector = new StubInspector(true, false);

      await expect(
        initProject(
          inputOf({
            presetName: PresetName.of('base'),
            projectRoot: '/tmp/does-not-exist',
            catalog,
            manifestStore,
            inspector,
          }),
        ),
      ).rejects.toThrow(ProjectDirMissingError);

      expect(manifestStore.writeCalls).toBe(0);
      expect(manifestStore.current).toBeNull();
    });

    it('attaches the projectRoot to ProjectDirMissingError so callers can name it', async () => {
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      const inspector = new StubInspector(true, false);

      try {
        await initProject(
          inputOf({
            presetName: PresetName.of('base'),
            projectRoot: '/tmp/missing-folder',
            catalog,
            manifestStore,
            inspector,
          }),
        );
        throw new Error('expected initProject to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectDirMissingError);
        if (err instanceof ProjectDirMissingError) {
          expect(err.projectRoot).toBe('/tmp/missing-folder');
          expect(err.code).toBe('PROJECT_DIR_MISSING');
        }
      }
    });

    it('probes the project dir BEFORE the git-repo check', async () => {
      // A missing folder cannot be a git working tree. The dir-missing
      // error wins so the UI can offer mkdir -p rather than git init.
      const catalog = presetCatalog('base');
      const manifestStore = new InMemoryManifestStore();
      const inspector = new StubInspector(false, false);

      await expect(
        initProject(
          inputOf({
            presetName: PresetName.of('base'),
            catalog,
            manifestStore,
            inspector,
          }),
        ),
      ).rejects.toThrow(ProjectDirMissingError);
    });
  });
});
