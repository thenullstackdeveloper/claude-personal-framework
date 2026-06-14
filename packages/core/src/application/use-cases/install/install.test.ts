import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError, PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import { Agent } from '../../../domain/model/agent.js';
import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import { Command } from '../../../domain/model/command.js';
import { ContentHash } from '../../../domain/model/content-hash.js';
import { GitHook } from '../../../domain/model/git-hook.js';
import {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  PresetName,
  SkillId,
} from '../../../domain/model/identifiers.js';
import { Instructions } from '../../../domain/model/instructions.js';
import { type LockedArtifact, Lockfile } from '../../../domain/model/lockfile.js';
import { Override } from '../../../domain/model/override.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Settings } from '../../../domain/model/settings.js';
import { Skill } from '../../../domain/model/skill.js';
import type {
  CatalogPort,
  GitConfigPort,
  LockfileStorePort,
  ProjectInspectorPort,
  WriterPort,
} from '../../ports/index.js';
import { ProjectDirMissingError } from '../init-project/errors.js';
import { UnmanagedClaudeMdError, UnmanagedGitHookError } from './errors.js';
import { install } from './install.use-case.js';

class InMemoryCatalog implements CatalogPort {
  constructor(
    private readonly presets: readonly Preset[],
    private readonly agents: Map<string, string> = new Map(),
    private readonly skills: Map<string, string> = new Map(),
    private readonly commands: Map<string, string> = new Map(),
    private readonly instructions: Map<string, string> = new Map(),
    private readonly gitHooks: Map<string, string> = new Map(),
  ) {}

  async listPresets(): Promise<readonly Preset[]> {
    return this.presets;
  }

  async listAgents() {
    return [...this.agents.keys()].map((id) => ({ id: AgentId.of(id), description: '' }));
  }
  async listSkills() {
    return [...this.skills.keys()].map((id) => ({ id: SkillId.of(id), description: '' }));
  }
  async listCommands() {
    return [...this.commands.keys()].map((id) => ({ id: CommandId.of(id), description: '' }));
  }

  async listInstructions() {
    return [...this.instructions.keys()].map((id) => ({
      id: InstructionsId.of(id),
      description: '',
    }));
  }

  async listGitHooks() {
    return [...this.gitHooks.keys()].map((name) => ({ hookName: HookName.of(name) }));
  }

  async readAgent(id: AgentId): Promise<Agent> {
    const content = this.agents.get(id.toString());
    if (content === undefined) {
      throw new ArtifactNotFoundError(`agent "${id}" not in fake catalog`);
    }
    return Agent.of(id, content);
  }

  async readSkill(id: SkillId): Promise<Skill> {
    const content = this.skills.get(id.toString());
    if (content === undefined) {
      throw new ArtifactNotFoundError(`skill "${id}" not in fake catalog`);
    }
    return Skill.of(id, content);
  }

  async readCommand(id: CommandId): Promise<Command> {
    const content = this.commands.get(id.toString());
    if (content === undefined) {
      throw new ArtifactNotFoundError(`command "${id}" not in fake catalog`);
    }
    return Command.of(id, content);
  }

  async readInstructions(id: InstructionsId): Promise<Instructions> {
    const content = this.instructions.get(id.toString());
    if (content === undefined) {
      throw new ArtifactNotFoundError(`instructions "${id}" not in fake catalog`);
    }
    return Instructions.of(content);
  }

  async readGitHook(name: HookName): Promise<GitHook> {
    const content = this.gitHooks.get(name);
    if (content === undefined) {
      throw new ArtifactNotFoundError(`git-hook "${name}" not in fake catalog`);
    }
    return GitHook.of(name, content);
  }
}

class RecordingWriter implements WriterPort {
  written: {
    agents: Agent[];
    skills: Skill[];
    commands: Command[];
    settings: Settings[];
    instructions: Instructions[];
    gitHooks: GitHook[];
  } = {
    agents: [],
    skills: [],
    commands: [],
    settings: [],
    instructions: [],
    gitHooks: [],
  };
  deleted: {
    agents: AgentId[];
    skills: SkillId[];
    commands: CommandId[];
    settingsCount: number;
    instructionsCount: number;
    gitHooks: HookName[];
  } = {
    agents: [],
    skills: [],
    commands: [],
    settingsCount: 0,
    instructionsCount: 0,
    gitHooks: [],
  };

  async writeAgent(agent: Agent): Promise<void> {
    this.written.agents.push(agent);
  }
  async writeSkill(skill: Skill): Promise<void> {
    this.written.skills.push(skill);
  }
  async writeCommand(command: Command): Promise<void> {
    this.written.commands.push(command);
  }
  async deleteAgent(id: AgentId): Promise<void> {
    this.deleted.agents.push(id);
  }
  async deleteSkill(id: SkillId): Promise<void> {
    this.deleted.skills.push(id);
  }
  async deleteCommand(id: CommandId): Promise<void> {
    this.deleted.commands.push(id);
  }
  async writeSettings(settings: Settings): Promise<void> {
    this.written.settings.push(settings);
  }
  async deleteSettings(): Promise<void> {
    this.deleted.settingsCount++;
  }
  async writeInstructions(instructions: Instructions): Promise<void> {
    this.written.instructions.push(instructions);
  }
  async deleteInstructions(): Promise<void> {
    this.deleted.instructionsCount++;
  }
  async writeGitHook(hook: GitHook): Promise<void> {
    this.written.gitHooks.push(hook);
  }
  async deleteGitHook(name: HookName): Promise<void> {
    this.deleted.gitHooks.push(name);
  }
}

class InMemoryLockfileStore implements LockfileStorePort {
  current: Lockfile | null = null;

  async read(): Promise<Lockfile | null> {
    return this.current;
  }

  async write(lockfile: Lockfile): Promise<void> {
    this.current = lockfile;
  }
}

class StubInspector implements ProjectInspectorPort {
  constructor(
    private claudeMd = false,
    private hooks: Set<HookName> = new Set(),
    private gitRepo = true,
    private dirExists = true,
  ) {}
  setClaudeMd(value: boolean): void {
    this.claudeMd = value;
  }
  setGitHook(name: HookName, exists: boolean): void {
    if (exists) this.hooks.add(name);
    else this.hooks.delete(name);
  }
  setGitRepo(value: boolean): void {
    this.gitRepo = value;
  }
  setDirExists(value: boolean): void {
    this.dirExists = value;
  }
  async claudeMdExists(): Promise<boolean> {
    return this.claudeMd;
  }
  async gitHookExists(name: HookName): Promise<boolean> {
    return this.hooks.has(name);
  }
  async isGitRepo(): Promise<boolean> {
    return this.gitRepo;
  }
  async projectDirExists(): Promise<boolean> {
    return this.dirExists;
  }
}

class FakeGitConfig implements GitConfigPort {
  constructor(private value: string | null = null) {}
  async getHooksPath(): Promise<string | null> {
    return this.value;
  }
  async setHooksPath(path: string): Promise<void> {
    this.value = path;
  }
  current(): string | null {
    return this.value;
  }
}

const buildManifest = (overrides: readonly Override[] = []): ProjectManifest => ({
  presetName: PresetName.of('base'),
  overrides,
});

describe('install use case', () => {
  let writer: RecordingWriter;
  let lockfileStore: InMemoryLockfileStore;
  let inspector: StubInspector;

  beforeEach(() => {
    writer = new RecordingWriter();
    lockfileStore = new InMemoryLockfileStore();
    inspector = new StubInspector(false);
  });

  it('first install: writes everything, deletes nothing', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('docs-manager'), AgentId.of('pr-creator')],
        }),
      ],
      new Map([
        ['docs-manager', 'd'],
        ['pr-creator', 'p'],
      ]),
    );

    const result = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.written.agents.map((a) => a.id.toString())).toEqual([
      'docs-manager',
      'pr-creator',
    ]);
    expect(writer.deleted.agents).toEqual([]);
    expect(result.drift.added).toHaveLength(2);
    expect(result.drift.removed).toEqual([]);
  });

  it('persists a lockfile after install', async () => {
    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
      new Map([['a', 'x']]),
    );

    await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(lockfileStore.current).not.toBeNull();
    expect(lockfileStore.current?.presetName.toString()).toBe('base');
    expect(lockfileStore.current?.artifacts.map((art) => art.ref.id.toString())).toEqual(['a']);
  });

  it('idempotent: re-installing with no changes produces the same lockfile and no deletes', async () => {
    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
      new Map([['a', 'same']]),
    );

    await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    // Reset writer to observe second run
    writer = new RecordingWriter();
    const second = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(second.drift.unchanged).toHaveLength(1);
    expect(second.drift.added).toEqual([]);
    expect(second.drift.removed).toEqual([]);
    expect(writer.deleted.agents).toEqual([]);
    // We still rewrite to be idempotent (restores deleted files etc.)
    expect(writer.written.agents).toHaveLength(1);
  });

  it('detects updated content and rewrites the file', async () => {
    // Prime lockfile with old hash
    const oldHash = ContentHash.of('old');
    const lockedAsOld: LockedArtifact = {
      ref: ArtifactRef.agent(AgentId.of('docs')),
      contentHash: oldHash,
    };
    lockfileStore.current = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [lockedAsOld],
      settings: Settings.empty(),
      instructions: Instructions.empty(),
    });

    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('docs')] })],
      new Map([['docs', 'new']]),
    );

    const result = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(result.drift.updated).toHaveLength(1);
    expect(writer.written.agents.map((a) => a.content)).toEqual(['new']);
  });

  it('deletes only what was in the previous lockfile but no longer in the preset', async () => {
    lockfileStore.current = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [
        {
          ref: ArtifactRef.agent(AgentId.of('was-here')),
          contentHash: ContentHash.of('x'),
        },
        {
          ref: ArtifactRef.agent(AgentId.of('still-here')),
          contentHash: ContentHash.of('y'),
        },
      ],
      settings: Settings.empty(),
      instructions: Instructions.empty(),
    });

    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('still-here')],
        }),
      ],
      new Map([['still-here', 'y']]),
    );

    await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.deleted.agents.map(String)).toEqual(['was-here']);
    expect(writer.written.agents.map((a) => a.id.toString())).toEqual(['still-here']);
  });

  it('skips an agent disabled by an override and removes it if it was in the lockfile', async () => {
    lockfileStore.current = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [
        { ref: ArtifactRef.agent(AgentId.of('keep')), contentHash: ContentHash.of('k') },
        { ref: ArtifactRef.agent(AgentId.of('drop')), contentHash: ContentHash.of('d') },
      ],
      settings: Settings.empty(),
      instructions: Instructions.empty(),
    });

    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('keep'), AgentId.of('drop')],
        }),
      ],
      new Map([
        ['keep', 'k'],
        ['drop', 'd'],
      ]),
    );

    await install({
      manifest: buildManifest([Override.disable(ArtifactRef.agent(AgentId.of('drop')))]),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.deleted.agents.map(String)).toEqual(['drop']);
    expect(writer.written.agents.map((a) => a.id.toString())).toEqual(['keep']);
  });

  it('resolves extends before computing drift', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('docs-manager')],
        }),
        Preset.of({
          name: PresetName.of('rn'),
          extends_: [PresetName.of('base')],
          agentIds: [AgentId.of('pr-creator')],
        }),
      ],
      new Map([
        ['docs-manager', 'd'],
        ['pr-creator', 'p'],
      ]),
    );

    await install({
      manifest: { presetName: PresetName.of('rn'), overrides: [] },
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.written.agents.map((a) => a.id.toString())).toEqual([
      'docs-manager',
      'pr-creator',
    ]);
  });

  it('replaces an agent content when a patch override matches', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('docs-manager')],
        }),
      ],
      new Map([['docs-manager', 'original']]),
    );

    await install({
      manifest: buildManifest([
        Override.patch(ArtifactRef.agent(AgentId.of('docs-manager')), 'patched'),
      ]),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.written.agents).toHaveLength(1);
    const agent = writer.written.agents[0];
    if (!agent) throw new Error('expected one agent');
    expect(agent.content).toBe('patched');
  });

  it('writes skills and commands too', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          skillIds: [SkillId.of('hexagonal-rn')],
          commandIds: [CommandId.of('build-android')],
        }),
      ],
      new Map(),
      new Map([['hexagonal-rn', 's']]),
      new Map([['build-android', 'c']]),
    );

    await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(writer.written.skills.map((s) => s.id.toString())).toEqual(['hexagonal-rn']);
    expect(writer.written.commands.map((c) => c.id.toString())).toEqual(['build-android']);
  });

  describe('instructions', () => {
    const presetsWithIntro = [
      Preset.of({
        name: PresetName.of('base'),
        instructionsIds: [InstructionsId.of('intro')],
      }),
    ];

    it('writes CLAUDE.md and records hash on first install when the preset has instructions', async () => {
      const catalog = new InMemoryCatalog(
        presetsWithIntro,
        new Map(),
        new Map(),
        new Map(),
        new Map([['intro', 'hello, claude']]),
      );

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
      });

      expect(writer.written.instructions.map((i) => i.content)).toEqual(['hello, claude']);
      expect(result.written.instructions).toBe(true);
      expect(lockfileStore.current?.instructions.content).toBe('hello, claude');
      expect(lockfileStore.current?.instructionsHash.toString()).toMatch(/^[a-f0-9]{64}$/);
    });

    it('refuses to overwrite an unmanaged CLAUDE.md on first install', async () => {
      inspector.setClaudeMd(true);
      const catalog = new InMemoryCatalog(
        presetsWithIntro,
        new Map(),
        new Map(),
        new Map(),
        new Map([['intro', 'hi']]),
      );

      await expect(
        install({
          manifest: buildManifest(),
          projectPath: '/tmp/p',
          catalog,
          writer,
          lockfileStore,
          inspector,
        }),
      ).rejects.toThrow(UnmanagedClaudeMdError);

      expect(writer.written.instructions).toEqual([]);
      expect(lockfileStore.current).toBeNull();
    });

    it('does not check disk when the preset has no instructions', async () => {
      inspector.setClaudeMd(true); // would trigger take-over if "added"
      const catalog = new InMemoryCatalog(
        [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
        new Map([['a', 'x']]),
      );

      await expect(
        install({
          manifest: buildManifest(),
          projectPath: '/tmp/p',
          catalog,
          writer,
          lockfileStore,
          inspector,
        }),
      ).resolves.toBeDefined();
    });

    it('deletes CLAUDE.md when instructions disappear from the preset', async () => {
      lockfileStore.current = Lockfile.of({
        presetName: PresetName.of('base'),
        artifacts: [],
        settings: Settings.empty(),
        instructions: Instructions.of('previous'),
      });
      const catalog = new InMemoryCatalog([Preset.of({ name: PresetName.of('base') })]);

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
      });

      expect(writer.deleted.instructionsCount).toBe(1);
      expect(result.written.instructions).toBe(false);
      expect(lockfileStore.current?.instructions.isEmpty()).toBe(true);
    });

    it('rewrites CLAUDE.md when the content changes', async () => {
      lockfileStore.current = Lockfile.of({
        presetName: PresetName.of('base'),
        artifacts: [],
        settings: Settings.empty(),
        instructions: Instructions.of('old'),
      });
      const catalog = new InMemoryCatalog(
        presetsWithIntro,
        new Map(),
        new Map(),
        new Map(),
        new Map([['intro', 'new']]),
      );

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
      });

      expect(result.drift.instructions.kind).toBe('updated');
      expect(writer.written.instructions.map((i) => i.content)).toEqual(['new']);
    });
  });

  it('builds a Composition with the resolved settings', async () => {
    const catalog = new InMemoryCatalog([
      Preset.of({
        name: PresetName.of('base'),
        settings: Settings.of({ allow: ['Bash(ls)'] }),
      }),
    ]);

    const result = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
      inspector,
    });

    expect(result.composition.projectPath).toBe('/tmp/p');
    expect(result.composition.settings.permissions.allow).toEqual(['Bash(ls)']);
  });

  describe('git hooks', () => {
    const presetWithHooks = (names: readonly HookName[]) =>
      Preset.of({ name: PresetName.of('base'), gitHookNames: names });

    it('first install with hooks: writes them and activates core.hooksPath via gitConfig', async () => {
      const catalog = new InMemoryCatalog(
        [presetWithHooks([HookName.of('commit-msg'), HookName.of('pre-commit')])],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map([
          ['commit-msg', '#!/bin/sh\nexit 0\n'],
          ['pre-commit', '#!/bin/sh\nexit 0\n'],
        ]),
      );
      const gitConfig = new FakeGitConfig(null);

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
        gitConfig,
      });

      expect(writer.written.gitHooks.map((h) => h.hookName).sort()).toEqual([
        'commit-msg',
        'pre-commit',
      ]);
      expect(result.written.gitHooks.sort()).toEqual(['commit-msg', 'pre-commit']);
      expect(result.written.gitConfigActivated).toBe(true);
      expect(gitConfig.current()).toBe('.githooks');
      expect(lockfileStore.current?.gitHooks.map((h) => h.hookName).sort()).toEqual([
        'commit-msg',
        'pre-commit',
      ]);
    });

    it('idempotent re-install: does not re-activate core.hooksPath after the first set', async () => {
      const catalog = new InMemoryCatalog(
        [presetWithHooks([HookName.of('commit-msg')])],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map([['commit-msg', 'same']]),
      );
      const gitConfig = new FakeGitConfig(null);

      await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
        gitConfig,
      });
      // First run sets it.
      expect(gitConfig.current()).toBe('.githooks');

      writer = new RecordingWriter();
      const second = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
        gitConfig,
      });

      // Hooks are rewritten for idempotence but the config is not re-activated.
      expect(writer.written.gitHooks).toHaveLength(1);
      expect(second.written.gitConfigActivated).toBe(false);
      expect(gitConfig.current()).toBe('.githooks');
    });

    it('respects an existing core.hooksPath set to a different value', async () => {
      const catalog = new InMemoryCatalog(
        [presetWithHooks([HookName.of('commit-msg')])],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map([['commit-msg', 'x']]),
      );
      const gitConfig = new FakeGitConfig('.my-hooks');

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
        gitConfig,
      });

      expect(result.written.gitConfigActivated).toBe(false);
      expect(gitConfig.current()).toBe('.my-hooks');
    });

    it('take-over: refuses to overwrite an unmanaged .githooks/<name>', async () => {
      inspector.setGitHook(HookName.of('commit-msg'), true);
      const catalog = new InMemoryCatalog(
        [presetWithHooks([HookName.of('commit-msg')])],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map([['commit-msg', 'x']]),
      );

      await expect(
        install({
          manifest: buildManifest(),
          projectPath: '/tmp/p',
          catalog,
          writer,
          lockfileStore,
          inspector,
        }),
      ).rejects.toThrow(UnmanagedGitHookError);

      expect(writer.written.gitHooks).toEqual([]);
      expect(lockfileStore.current).toBeNull();
    });

    it('skips core.hooksPath activation when the project is not a git repo', async () => {
      inspector.setGitRepo(false);
      const catalog = new InMemoryCatalog(
        [presetWithHooks([HookName.of('commit-msg')])],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map([['commit-msg', '#!/bin/sh\n']]),
      );
      const gitConfig = new FakeGitConfig(null);

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
        gitConfig,
      });

      // Hooks were still written; the user gets them in .githooks/ for free.
      expect(writer.written.gitHooks.map((h) => h.hookName)).toEqual(['commit-msg']);
      // But the git config call never happened.
      expect(gitConfig.current()).toBeNull();
      expect(result.written.gitConfigActivated).toBe(false);
      expect(result.written.gitConfigCurrent).toBeNull();
      expect(result.written.gitConfigSkippedReason).toBe('not-a-git-repo');
    });

    it('does not skip when there are no hooks in the composition (back-compat)', async () => {
      // No hooks at all → skippedReason stays null even if the project
      // happens to not be a repo. The check is gated behind hookCount > 0.
      inspector.setGitRepo(false);
      const catalog = new InMemoryCatalog([
        Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('docs-manager')] }),
      ]);
      catalog['agents'].set('docs-manager', 'body');

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
      });

      expect(result.written.gitConfigSkippedReason).toBeNull();
    });

    it('removes a hook when it disappears from the preset', async () => {
      lockfileStore.current = Lockfile.of({
        presetName: PresetName.of('base'),
        artifacts: [],
        settings: Settings.empty(),
        instructions: Instructions.empty(),
        gitHooks: [{ hookName: HookName.of('pre-push'), contentHash: ContentHash.of('p') }],
      });
      const catalog = new InMemoryCatalog([presetWithHooks([])]);

      const result = await install({
        manifest: buildManifest(),
        projectPath: '/tmp/p',
        catalog,
        writer,
        lockfileStore,
        inspector,
      });

      expect(writer.deleted.gitHooks).toEqual(['pre-push']);
      expect(result.written.gitHooks).toEqual([]);
      expect(lockfileStore.current?.gitHooks).toEqual([]);
    });
  });

  describe('errors', () => {
    it('propagates PresetNotFoundError', async () => {
      const catalog = new InMemoryCatalog([]);
      await expect(
        install({
          manifest: { presetName: PresetName.of('missing'), overrides: [] },
          projectPath: '/tmp/p',
          catalog,
          writer,
          lockfileStore,
          inspector,
        }),
      ).rejects.toThrow(PresetNotFoundError);
    });

    it('propagates ArtifactNotFoundError', async () => {
      const catalog = new InMemoryCatalog(
        [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('ghost')] })],
        new Map(),
      );
      await expect(
        install({
          manifest: buildManifest(),
          projectPath: '/tmp/p',
          catalog,
          writer,
          lockfileStore,
          inspector,
        }),
      ).rejects.toThrow(ArtifactNotFoundError);
    });

    it('throws ProjectDirMissingError when the project dir does not exist', async () => {
      const catalog = new InMemoryCatalog([Preset.of({ name: PresetName.of('base') })]);
      inspector.setDirExists(false);

      try {
        await install({
          manifest: buildManifest(),
          projectPath: '/tmp/does-not-exist',
          catalog,
          writer,
          lockfileStore,
          inspector,
        });
        throw new Error('expected install to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectDirMissingError);
        if (err instanceof ProjectDirMissingError) {
          expect(err.projectRoot).toBe('/tmp/does-not-exist');
          expect(err.code).toBe('PROJECT_DIR_MISSING');
        }
      }
    });
  });
});
