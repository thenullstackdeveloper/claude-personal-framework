import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError, PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import { Agent } from '../../../domain/model/agent.js';
import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import { Command } from '../../../domain/model/command.js';
import { ContentHash } from '../../../domain/model/content-hash.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../../domain/model/identifiers.js';
import { type LockedArtifact, Lockfile } from '../../../domain/model/lockfile.js';
import { Override } from '../../../domain/model/override.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Settings } from '../../../domain/model/settings.js';
import { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort, LockfileStorePort, WriterPort } from '../../ports/index.js';
import { install } from './install.use-case.js';

class InMemoryCatalog implements CatalogPort {
  constructor(
    private readonly presets: readonly Preset[],
    private readonly agents: Map<string, string> = new Map(),
    private readonly skills: Map<string, string> = new Map(),
    private readonly commands: Map<string, string> = new Map(),
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
}

class RecordingWriter implements WriterPort {
  written: { agents: Agent[]; skills: Skill[]; commands: Command[]; settings: Settings[] } = {
    agents: [],
    skills: [],
    commands: [],
    settings: [],
  };
  deleted: {
    agents: AgentId[];
    skills: SkillId[];
    commands: CommandId[];
    settingsCount: number;
  } = {
    agents: [],
    skills: [],
    commands: [],
    settingsCount: 0,
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

const buildManifest = (overrides: readonly Override[] = []): ProjectManifest => ({
  presetName: PresetName.of('base'),
  overrides,
});

describe('install use case', () => {
  let writer: RecordingWriter;
  let lockfileStore: InMemoryLockfileStore;

  beforeEach(() => {
    writer = new RecordingWriter();
    lockfileStore = new InMemoryLockfileStore();
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
    });

    // Reset writer to observe second run
    writer = new RecordingWriter();
    const second = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
      lockfileStore,
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
    });

    expect(writer.written.skills.map((s) => s.id.toString())).toEqual(['hexagonal-rn']);
    expect(writer.written.commands.map((c) => c.id.toString())).toEqual(['build-android']);
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
    });

    expect(result.composition.projectPath).toBe('/tmp/p');
    expect(result.composition.settings.permissions.allow).toEqual(['Bash(ls)']);
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
        }),
      ).rejects.toThrow(ArtifactNotFoundError);
    });
  });
});
