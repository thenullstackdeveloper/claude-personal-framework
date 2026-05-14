import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactNotFoundError } from '../../../domain/errors/domain-error.js';
import { Agent } from '../../../domain/model/agent.js';
import { ArtifactRef } from '../../../domain/model/artifact-ref.js';
import type { Command } from '../../../domain/model/command.js';
import { ContentHash } from '../../../domain/model/content-hash.js';
import {
  AgentId,
  type CommandId,
  PresetName,
  type SkillId,
} from '../../../domain/model/identifiers.js';
import { Lockfile } from '../../../domain/model/lockfile.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import { Settings } from '../../../domain/model/settings.js';
import type { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort, LockfileStorePort } from '../../ports/index.js';
import { checkStatus } from './check-status.use-case.js';

class InMemoryCatalog implements CatalogPort {
  constructor(
    private readonly presets: readonly Preset[],
    private readonly agents: Map<string, string> = new Map(),
  ) {}

  async listPresets(): Promise<readonly Preset[]> {
    return this.presets;
  }
  async listAgents() {
    return [...this.agents.keys()].map((id) => ({ id: AgentId.of(id), description: '' }));
  }
  async listSkills() {
    return [];
  }
  async listCommands() {
    return [];
  }
  async readAgent(id: AgentId): Promise<Agent> {
    const content = this.agents.get(id.toString());
    if (content === undefined) throw new ArtifactNotFoundError(`missing ${id}`);
    return Agent.of(id, content);
  }
  async readSkill(id: SkillId): Promise<Skill> {
    throw new ArtifactNotFoundError(`no skills in fake: ${id}`);
  }
  async readCommand(id: CommandId): Promise<Command> {
    throw new ArtifactNotFoundError(`no commands in fake: ${id}`);
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

const manifest: ProjectManifest = {
  presetName: PresetName.of('base'),
  overrides: [],
};

describe('checkStatus use case', () => {
  let lockfileStore: InMemoryLockfileStore;

  beforeEach(() => {
    lockfileStore = new InMemoryLockfileStore();
  });

  it('reports hasLockfile=false and everything as added on first call', async () => {
    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
      new Map([['a', 'x']]),
    );

    const result = await checkStatus({
      manifest,
      projectPath: '/tmp/p',
      catalog,
      lockfileStore,
    });

    expect(result.hasLockfile).toBe(false);
    expect(result.drift.added).toHaveLength(1);
    expect(result.drift.updated).toEqual([]);
    expect(result.drift.removed).toEqual([]);
    expect(result.drift.unchanged).toEqual([]);
  });

  it('reports unchanged when lockfile matches the catalog', async () => {
    lockfileStore.current = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [{ ref: ArtifactRef.agent(AgentId.of('a')), contentHash: ContentHash.of('x') }],
      settings: Settings.empty(),
    });

    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
      new Map([['a', 'x']]),
    );

    const result = await checkStatus({
      manifest,
      projectPath: '/tmp/p',
      catalog,
      lockfileStore,
    });

    expect(result.hasLockfile).toBe(true);
    expect(result.drift.unchanged.map((r) => r.id.toString())).toEqual(['a']);
    expect(result.drift.added).toEqual([]);
    expect(result.drift.updated).toEqual([]);
  });

  it('reports updated when catalog content differs from the lockfile sha', async () => {
    lockfileStore.current = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [{ ref: ArtifactRef.agent(AgentId.of('a')), contentHash: ContentHash.of('old') }],
      settings: Settings.empty(),
    });

    const catalog = new InMemoryCatalog(
      [Preset.of({ name: PresetName.of('base'), agentIds: [AgentId.of('a')] })],
      new Map([['a', 'new']]),
    );

    const result = await checkStatus({
      manifest,
      projectPath: '/tmp/p',
      catalog,
      lockfileStore,
    });

    expect(result.drift.updated.map((u) => u.ref.id.toString())).toEqual(['a']);
  });

  it('does not modify the lockfile (read-only operation)', async () => {
    const initialLockfile = Lockfile.of({
      presetName: PresetName.of('base'),
      artifacts: [],
      settings: Settings.empty(),
    });
    lockfileStore.current = initialLockfile;

    const catalog = new InMemoryCatalog([Preset.of({ name: PresetName.of('base') })]);

    await checkStatus({
      manifest,
      projectPath: '/tmp/p',
      catalog,
      lockfileStore,
    });

    // Reference equality: store was not written to
    expect(lockfileStore.current).toBe(initialLockfile);
  });
});
