import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogPort } from '../../application/ports/catalog.port.js';
import {
  ArtifactNotFoundError,
  InvalidHookNameError,
  InvalidSlugError,
} from '../../domain/errors/domain-error.js';
import { Agent } from '../../domain/model/agent.js';
import type {
  AgentSummary,
  CommandSummary,
  GitHookSummary,
  InstructionsSummary,
  SkillSummary,
} from '../../domain/model/artifact-summary.js';
import { Command } from '../../domain/model/command.js';
import { GitHook } from '../../domain/model/git-hook.js';
import {
  AgentId,
  CommandId,
  HookName,
  InstructionsId,
  SkillId,
} from '../../domain/model/identifiers.js';
import { Instructions } from '../../domain/model/instructions.js';
import type { Preset } from '../../domain/model/preset.js';
import { Skill } from '../../domain/model/skill.js';
import { extractFrontmatterDescription } from '../markdown/frontmatter.js';
import { parsePreset } from '../yaml/parse-preset.js';

const PRESET_EXT = '.yaml';
const ARTIFACT_EXT = '.md';
const GITHOOKS_SUBDIR = 'git-hooks';

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};

const readArtifactFile = async (path: string, label: string): Promise<string> => {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      throw new ArtifactNotFoundError(`${label} not found at ${path}`);
    }
    throw err;
  }
};

const listMarkdownFiles = async (dir: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(ARTIFACT_EXT));
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return [];
    throw err;
  }
};

const parseIdOrSkip = <T>(rawId: string, factory: (s: string) => T): T | null => {
  try {
    return factory(rawId);
  } catch (err) {
    if (err instanceof InvalidSlugError) return null;
    throw err;
  }
};

export class CatalogReader implements CatalogPort {
  constructor(public readonly frameworkRoot: string) {}

  async listPresets(): Promise<readonly Preset[]> {
    const dir = join(this.frameworkRoot, 'presets');
    let entries: readonly string[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return [];
      throw err;
    }

    const yamlFiles = entries.filter((name) => name.endsWith(PRESET_EXT));
    const presets: Preset[] = [];
    for (const file of yamlFiles) {
      const name = file.slice(0, -PRESET_EXT.length);
      const content = await readFile(join(dir, file), 'utf-8');
      presets.push(parsePreset(content, name));
    }
    return presets;
  }

  async listAgents(): Promise<readonly AgentSummary[]> {
    return this.listArtifactSummaries('agents', (raw) => parseIdOrSkip(raw, AgentId.of));
  }

  async listSkills(): Promise<readonly SkillSummary[]> {
    return this.listArtifactSummaries('skills', (raw) => parseIdOrSkip(raw, SkillId.of));
  }

  async listCommands(): Promise<readonly CommandSummary[]> {
    return this.listArtifactSummaries('commands', (raw) => parseIdOrSkip(raw, CommandId.of));
  }

  async listInstructions(): Promise<readonly InstructionsSummary[]> {
    // Instructions are markdown plano sin frontmatter — el summary deja
    // description vacío en MVP. La carpeta puede no existir si el catálogo
    // no usa instructions todavía; en ese caso devolvemos lista vacía vía
    // listArtifactSummaries (ya hace fallback ENOENT).
    return this.listArtifactSummaries('instructions', (raw) =>
      parseIdOrSkip(raw, InstructionsId.of),
    );
  }

  private async listArtifactSummaries<TId extends { toString(): string }>(
    subdir: string,
    factory: (rawId: string) => TId | null,
  ): Promise<readonly { id: TId; description: string }[]> {
    const dir = join(this.frameworkRoot, subdir);
    const files = await listMarkdownFiles(dir);
    const summaries: { id: TId; description: string }[] = [];
    for (const file of files) {
      const rawId = file.slice(0, -ARTIFACT_EXT.length);
      const id = factory(rawId);
      if (id === null) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      summaries.push({ id, description: extractFrontmatterDescription(content) });
    }
    return summaries;
  }

  async readAgent(id: AgentId): Promise<Agent> {
    const path = join(this.frameworkRoot, 'agents', `${id.toString()}${ARTIFACT_EXT}`);
    const content = await readArtifactFile(path, `agent "${id.toString()}"`);
    return Agent.of(id, content);
  }

  async readSkill(id: SkillId): Promise<Skill> {
    const path = join(this.frameworkRoot, 'skills', `${id.toString()}${ARTIFACT_EXT}`);
    const content = await readArtifactFile(path, `skill "${id.toString()}"`);
    return Skill.of(id, content);
  }

  async readCommand(id: CommandId): Promise<Command> {
    const path = join(this.frameworkRoot, 'commands', `${id.toString()}${ARTIFACT_EXT}`);
    const content = await readArtifactFile(path, `command "${id.toString()}"`);
    return Command.of(id, content);
  }

  async readInstructions(id: InstructionsId): Promise<Instructions> {
    const path = join(this.frameworkRoot, 'instructions', `${id.toString()}${ARTIFACT_EXT}`);
    const content = await readArtifactFile(path, `instructions "${id.toString()}"`);
    return Instructions.of(content);
  }

  async listGitHooks(): Promise<readonly GitHookSummary[]> {
    const dir = join(this.frameworkRoot, GITHOOKS_SUBDIR);
    let entries: readonly string[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return [];
      throw err;
    }
    const summaries: GitHookSummary[] = [];
    for (const name of entries) {
      // Hook files have no extension. Names outside the closed enum are
      // silently skipped — same pattern as parseIdOrSkip for Slug-based ids.
      try {
        summaries.push({ hookName: HookName.of(name) });
      } catch (err) {
        if (err instanceof InvalidHookNameError) continue;
        throw err;
      }
    }
    return summaries;
  }

  async readGitHook(hookName: HookName): Promise<GitHook> {
    const path = join(this.frameworkRoot, GITHOOKS_SUBDIR, hookName);
    const content = await readArtifactFile(path, `git-hook "${hookName}"`);
    return GitHook.of(hookName, content);
  }
}
