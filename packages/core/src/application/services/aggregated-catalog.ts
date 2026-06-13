import { ArtifactNotFoundError } from '../../domain/errors/domain-error.js';
import type { Agent } from '../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  GitHookSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../domain/model/artifact-summary.js';
import type { Command } from '../../domain/model/command.js';
import type { GitHook } from '../../domain/model/git-hook.js';
import type {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  SkillId,
} from '../../domain/model/identifiers.js';
import type { Instructions } from '../../domain/model/instructions.js';
import type { Preset } from '../../domain/model/preset.js';
import type { Skill } from '../../domain/model/skill.js';
import type { CatalogPort } from '../ports/catalog.port.js';

/**
 * Composes several CatalogPorts into one with first-wins precedence on
 * collisions by id. Sources are passed in DESCENDING precedence — sources[0]
 * beats sources[1], etc.
 *
 * On list*: items from later sources are suppressed if their id already
 * appeared in an earlier source. On read*: sources are tried in order and the
 * first hit wins; ArtifactNotFoundError if none hits.
 *
 * Composition policy (precedence + dedup) lives here in application rather
 * than leaking into any adapter, so adapters stay agnostic to how they may
 * be combined. See ADR-0004.
 */
export class AggregatedCatalog implements CatalogPort {
  constructor(private readonly sources: readonly CatalogPort[]) {}

  async listPresets(): Promise<readonly Preset[]> {
    return this.collectFirstWins(
      (source) => source.listPresets(),
      (preset) => String(preset.name),
    );
  }

  async listAgents(): Promise<readonly AgentSummary[]> {
    return this.collectFirstWins(
      (source) => source.listAgents(),
      (summary) => String(summary.id),
    );
  }

  async listSkills(): Promise<readonly SkillSummary[]> {
    return this.collectFirstWins(
      (source) => source.listSkills(),
      (summary) => String(summary.id),
    );
  }

  async listCommands(): Promise<readonly CommandSummary[]> {
    return this.collectFirstWins(
      (source) => source.listCommands(),
      (summary) => String(summary.id),
    );
  }

  async listInstructions(): Promise<readonly InstructionsSummary[]> {
    return this.collectFirstWins(
      (source) => source.listInstructions(),
      (summary) => String(summary.id),
    );
  }

  async listGitHooks(): Promise<readonly GitHookSummary[]> {
    return this.collectFirstWins(
      (source) => source.listGitHooks(),
      (summary) => String(summary.hookName),
    );
  }

  async readAgent(id: AgentId): Promise<Agent> {
    return this.tryReadFirstWins((source) => source.readAgent(id), `agent "${String(id)}"`);
  }

  async readSkill(id: SkillId): Promise<Skill> {
    return this.tryReadFirstWins((source) => source.readSkill(id), `skill "${String(id)}"`);
  }

  async readCommand(id: CommandId): Promise<Command> {
    return this.tryReadFirstWins((source) => source.readCommand(id), `command "${String(id)}"`);
  }

  async readInstructions(id: InstructionsId): Promise<Instructions> {
    return this.tryReadFirstWins(
      (source) => source.readInstructions(id),
      `instructions "${String(id)}"`,
    );
  }

  async readGitHook(hookName: HookName): Promise<GitHook> {
    return this.tryReadFirstWins(
      (source) => source.readGitHook(hookName),
      `git-hook "${String(hookName)}"`,
    );
  }

  private async collectFirstWins<T>(
    fetch: (source: CatalogPort) => Promise<readonly T[]>,
    key: (item: T) => string,
  ): Promise<readonly T[]> {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const source of this.sources) {
      const items = await fetch(source);
      for (const item of items) {
        const k = key(item);
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(item);
      }
    }
    return result;
  }

  private async tryReadFirstWins<T>(
    read: (source: CatalogPort) => Promise<T>,
    label: string,
  ): Promise<T> {
    for (const source of this.sources) {
      try {
        return await read(source);
      } catch (err) {
        if (err instanceof ArtifactNotFoundError) continue;
        throw err;
      }
    }
    throw new ArtifactNotFoundError(`${label} not found in any catalog source`);
  }
}
