import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError, PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import { Agent } from '../../../domain/model/agent.js';
import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import { Command } from '../../../domain/model/command.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../../domain/model/identifiers.js';
import { Override } from '../../../domain/model/override.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Settings } from '../../../domain/model/settings.js';
import { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort, WriterPort } from '../../ports/index.js';
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
    return [...this.agents.keys()].map((id) => ({
      id: AgentId.of(id),
      description: '',
    }));
  }

  async listSkills() {
    return [...this.skills.keys()].map((id) => ({
      id: SkillId.of(id),
      description: '',
    }));
  }

  async listCommands() {
    return [...this.commands.keys()].map((id) => ({
      id: CommandId.of(id),
      description: '',
    }));
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
  cleanCallCount = 0;
  agents: Agent[] = [];
  skills: Skill[] = [];
  commands: Command[] = [];
  cleanedBeforeWrites = true;

  async cleanArtifacts(): Promise<void> {
    if (this.agents.length > 0 || this.skills.length > 0 || this.commands.length > 0) {
      this.cleanedBeforeWrites = false;
    }
    this.cleanCallCount++;
  }

  async writeAgent(agent: Agent): Promise<void> {
    this.agents.push(agent);
  }

  async writeSkill(skill: Skill): Promise<void> {
    this.skills.push(skill);
  }

  async writeCommand(command: Command): Promise<void> {
    this.commands.push(command);
  }
}

const buildManifest = (overrides: readonly Override[] = []): ProjectManifest => ({
  presetName: PresetName.of('base'),
  overrides,
});

describe('install use case', () => {
  let writer: RecordingWriter;

  beforeEach(() => {
    writer = new RecordingWriter();
  });

  it('writes the agents declared by the preset', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('docs-manager'), AgentId.of('pr-creator')],
        }),
      ],
      new Map([
        ['docs-manager', 'docs-manager body'],
        ['pr-creator', 'pr-creator body'],
      ]),
    );

    const result = await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
    });

    expect(writer.agents.map((a) => a.id.toString())).toEqual(['docs-manager', 'pr-creator']);
    expect(writer.agents.map((a) => a.content)).toEqual(['docs-manager body', 'pr-creator body']);
    expect(result.written.agents.map(String)).toEqual(['docs-manager', 'pr-creator']);
  });

  it('resolves extends before writing', async () => {
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
      manifest: {
        presetName: PresetName.of('rn'),
        overrides: [],
      },
      projectPath: '/tmp/p',
      catalog,
      writer,
    });

    expect(writer.agents.map((a) => a.id.toString())).toEqual(['docs-manager', 'pr-creator']);
  });

  it('skips an agent disabled by an override', async () => {
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
    });

    expect(writer.agents.map((a) => a.id.toString())).toEqual(['keep']);
  });

  it('adds an agent declared by an add override (must exist in catalog)', async () => {
    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base') })],
      new Map([['extra', 'e']]),
    );

    await install({
      manifest: buildManifest([Override.add(ArtifactRef.agent(AgentId.of('extra')))]),
      projectPath: '/tmp/p',
      catalog,
      writer,
    });

    expect(writer.agents.map((a) => a.id.toString())).toEqual(['extra']);
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
        Override.patch(ArtifactRef.agent(AgentId.of('docs-manager')), 'patched body'),
      ]),
      projectPath: '/tmp/p',
      catalog,
      writer,
    });

    expect(writer.agents).toHaveLength(1);
    const agent = writer.agents[0];
    if (!agent) throw new Error('expected one agent');
    expect(agent.content).toBe('patched body');
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
    });

    expect(writer.skills.map((s) => s.id.toString())).toEqual(['hexagonal-rn']);
    expect(writer.commands.map((c) => c.id.toString())).toEqual(['build-android']);
  });

  it('calls cleanArtifacts before writing anything', async () => {
    const catalog = new InMemoryCatalog(
      [
        Preset.of({
          name: PresetName.of('base'),
          agentIds: [AgentId.of('a')],
        }),
      ],
      new Map([['a', 'x']]),
    );

    await install({
      manifest: buildManifest(),
      projectPath: '/tmp/p',
      catalog,
      writer,
    });

    expect(writer.cleanCallCount).toBe(1);
    expect(writer.cleanedBeforeWrites).toBe(true);
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
    });

    expect(result.composition.projectPath).toBe('/tmp/p');
    expect(result.composition.settings.permissions.allow).toEqual(['Bash(ls)']);
  });

  describe('errors', () => {
    it('propagates PresetNotFoundError when the manifest references an unknown preset', async () => {
      const catalog = new InMemoryCatalog([]);
      await expect(
        install({
          manifest: { presetName: PresetName.of('missing'), overrides: [] },
          projectPath: '/tmp/p',
          catalog,
          writer,
        }),
      ).rejects.toThrow(PresetNotFoundError);
    });

    it('propagates ArtifactNotFoundError when an agent id is not in the catalog', async () => {
      const catalog = new InMemoryCatalog(
        [
          Preset.of({
            name: PresetName.of('base'),
            agentIds: [AgentId.of('ghost')],
          }),
        ],
        new Map(),
      );
      await expect(
        install({
          manifest: buildManifest(),
          projectPath: '/tmp/p',
          catalog,
          writer,
        }),
      ).rejects.toThrow(ArtifactNotFoundError);
    });
  });
});
