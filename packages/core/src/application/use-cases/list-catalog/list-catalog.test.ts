import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../../domain/model/artifact-summary.js';
import type { Command } from '../../../domain/model/command.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../../domain/model/identifiers.js';
import type { Instructions } from '../../../domain/model/instructions.js';
import { Preset } from '../../../domain/model/preset.js';
import type { Skill } from '../../../domain/model/skill.js';
import type { CatalogPort } from '../../ports/index.js';
import { listCatalog } from './list-catalog.use-case.js';

class StubCatalog implements CatalogPort {
  constructor(
    private readonly presets: readonly Preset[],
    private readonly agents: readonly AgentSummary[],
    private readonly skills: readonly SkillSummary[],
    private readonly commands: readonly CommandSummary[],
    private readonly instructions: readonly InstructionsSummary[] = [],
  ) {}

  async listPresets(): Promise<readonly Preset[]> {
    return this.presets;
  }
  async listAgents(): Promise<readonly AgentSummary[]> {
    return this.agents;
  }
  async listSkills(): Promise<readonly SkillSummary[]> {
    return this.skills;
  }
  async listCommands(): Promise<readonly CommandSummary[]> {
    return this.commands;
  }
  async listInstructions(): Promise<readonly InstructionsSummary[]> {
    return this.instructions;
  }
  async readAgent(): Promise<Agent> {
    throw new Error('not used in listCatalog tests');
  }
  async readSkill(): Promise<Skill> {
    throw new Error('not used in listCatalog tests');
  }
  async readCommand(): Promise<Command> {
    throw new Error('not used in listCatalog tests');
  }
  async readInstructions(): Promise<Instructions> {
    throw new Error('not used in listCatalog tests');
  }
}

describe('listCatalog use case', () => {
  it('returns whatever the catalog reports for all artifact kinds', async () => {
    const catalog = new StubCatalog(
      [Preset.of({ name: PresetName.of('base') })],
      [{ id: AgentId.of('docs-manager'), description: 'docs' }],
      [{ id: SkillId.of('hex-rn'), description: 'rn skill' }],
      [{ id: CommandId.of('build-android'), description: 'cmd' }],
    );

    const result = await listCatalog({ catalog });

    expect(result.presets.map((p) => p.name.toString())).toEqual(['base']);
    expect(result.agents.map((a) => a.id.toString())).toEqual(['docs-manager']);
    expect(result.skills.map((s) => s.id.toString())).toEqual(['hex-rn']);
    expect(result.commands.map((c) => c.id.toString())).toEqual(['build-android']);
  });

  it('returns empty arrays when the catalog has nothing', async () => {
    const catalog = new StubCatalog([], [], [], []);
    const result = await listCatalog({ catalog });
    expect(result.presets).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.commands).toEqual([]);
  });

  it('queries the catalog in parallel (does not await sequentially)', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;

    const slowList = async <T>(value: readonly T[]): Promise<readonly T[]> => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return value;
    };

    const catalog: CatalogPort = {
      listPresets: () => slowList<Preset>([]),
      listAgents: () => slowList<AgentSummary>([]),
      listSkills: () => slowList<SkillSummary>([]),
      listCommands: () => slowList<CommandSummary>([]),
      listInstructions: () => slowList<InstructionsSummary>([]),
      readAgent: () => Promise.reject(new Error('unused')),
      readSkill: () => Promise.reject(new Error('unused')),
      readCommand: () => Promise.reject(new Error('unused')),
      readInstructions: () => Promise.reject(new Error('unused')),
    };

    await listCatalog({ catalog });
    expect(maxConcurrent).toBe(5);
  });
});
