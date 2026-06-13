import { describe, expect, it } from 'vitest';
import { ArtifactNotFoundError } from '../../domain/errors/domain-error.js';
import { Agent } from '../../domain/model/agent.js';
import { AgentId, PresetName } from '../../domain/model/identifiers.js';
import { Preset } from '../../domain/model/preset.js';
import type { CatalogPort } from '../ports/catalog.port.js';
import { AggregatedCatalog } from './aggregated-catalog.js';

const stubCatalog = (overrides: Partial<CatalogPort> = {}): CatalogPort => ({
  listPresets: async () => [],
  listAgents: async () => [],
  listSkills: async () => [],
  listCommands: async () => [],
  listInstructions: async () => [],
  listGitHooks: async () => [],
  readAgent: async () => {
    throw new ArtifactNotFoundError('agent not found in stub');
  },
  readSkill: async () => {
    throw new ArtifactNotFoundError('skill not found in stub');
  },
  readCommand: async () => {
    throw new ArtifactNotFoundError('command not found in stub');
  },
  readInstructions: async () => {
    throw new ArtifactNotFoundError('instructions not found in stub');
  },
  readGitHook: async () => {
    throw new ArtifactNotFoundError('hook not found in stub');
  },
  ...overrides,
});

describe('AggregatedCatalog', () => {
  describe('list*', () => {
    it('returns empty lists when no sources are provided', async () => {
      const aggregator = new AggregatedCatalog([]);
      expect(await aggregator.listPresets()).toEqual([]);
      expect(await aggregator.listAgents()).toEqual([]);
      expect(await aggregator.listSkills()).toEqual([]);
      expect(await aggregator.listCommands()).toEqual([]);
      expect(await aggregator.listInstructions()).toEqual([]);
      expect(await aggregator.listGitHooks()).toEqual([]);
    });

    it('passes results through unchanged with a single source', async () => {
      const presetA = Preset.of({ name: PresetName.of('a') });
      const source = stubCatalog({ listPresets: async () => [presetA] });
      const aggregator = new AggregatedCatalog([source]);
      expect(await aggregator.listPresets()).toEqual([presetA]);
    });

    it('concatenates presets across sources when there are no collisions', async () => {
      const presetA = Preset.of({ name: PresetName.of('a') });
      const presetB = Preset.of({ name: PresetName.of('b') });
      const sourceA = stubCatalog({ listPresets: async () => [presetA] });
      const sourceB = stubCatalog({ listPresets: async () => [presetB] });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      const presets = await aggregator.listPresets();
      expect(presets.map((p) => String(p.name))).toEqual(['a', 'b']);
    });

    it('dedups colliding presets by name, first source wins', async () => {
      const presetFromA = Preset.of({
        name: PresetName.of('shared'),
        agentIds: [AgentId.of('only-in-a')],
      });
      const presetFromB = Preset.of({
        name: PresetName.of('shared'),
        agentIds: [AgentId.of('only-in-b')],
      });
      const sourceA = stubCatalog({ listPresets: async () => [presetFromA] });
      const sourceB = stubCatalog({ listPresets: async () => [presetFromB] });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      const presets = await aggregator.listPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0]?.agentIds.map(String)).toEqual(['only-in-a']);
    });

    it('dedups agent summaries by id, first source wins', async () => {
      const sourceA = stubCatalog({
        listAgents: async () => [{ id: AgentId.of('shared'), description: 'from-a' }],
      });
      const sourceB = stubCatalog({
        listAgents: async () => [
          { id: AgentId.of('shared'), description: 'from-b' },
          { id: AgentId.of('only-in-b'), description: 'from-b' },
        ],
      });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      const agents = await aggregator.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0]?.description).toBe('from-a');
      expect(agents.map((a) => String(a.id))).toEqual(['shared', 'only-in-b']);
    });
  });

  describe('read*', () => {
    it('returns the first source hit even when a later source also has the artifact', async () => {
      const fromA = Agent.of(AgentId.of('agent-x'), 'content-a');
      const fromB = Agent.of(AgentId.of('agent-x'), 'content-b');
      const sourceA = stubCatalog({ readAgent: async () => fromA });
      const sourceB = stubCatalog({ readAgent: async () => fromB });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      const result = await aggregator.readAgent(AgentId.of('agent-x'));
      expect(result.content).toBe('content-a');
    });

    it('falls back to the next source when an earlier one throws ArtifactNotFoundError', async () => {
      const fallback = Agent.of(AgentId.of('agent-x'), 'fallback-content');
      const sourceA = stubCatalog();
      const sourceB = stubCatalog({ readAgent: async () => fallback });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      const result = await aggregator.readAgent(AgentId.of('agent-x'));
      expect(result.content).toBe('fallback-content');
    });

    it('throws ArtifactNotFoundError when every source misses', async () => {
      const aggregator = new AggregatedCatalog([stubCatalog(), stubCatalog()]);
      await expect(aggregator.readAgent(AgentId.of('agent-x'))).rejects.toBeInstanceOf(
        ArtifactNotFoundError,
      );
    });

    it('throws ArtifactNotFoundError when no sources at all are configured', async () => {
      const aggregator = new AggregatedCatalog([]);
      await expect(aggregator.readAgent(AgentId.of('agent-x'))).rejects.toBeInstanceOf(
        ArtifactNotFoundError,
      );
    });

    it('bubbles up non-ArtifactNotFoundError errors instead of trying next source', async () => {
      const sourceA = stubCatalog({
        readAgent: async () => {
          throw new Error('disk on fire');
        },
      });
      const sourceB = stubCatalog({
        readAgent: async () => Agent.of(AgentId.of('agent-x'), 'never-reached'),
      });
      const aggregator = new AggregatedCatalog([sourceA, sourceB]);
      await expect(aggregator.readAgent(AgentId.of('agent-x'))).rejects.toThrow('disk on fire');
    });
  });
});
