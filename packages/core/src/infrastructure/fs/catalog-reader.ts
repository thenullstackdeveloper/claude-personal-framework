import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogPort } from '../../application/use-cases/install/install.ports.js';
import { ArtifactNotFoundError } from '../../domain/errors/domain-error.js';
import { Agent } from '../../domain/model/agent.js';
import { Command } from '../../domain/model/command.js';
import type { AgentId, CommandId, SkillId } from '../../domain/model/identifiers.js';
import type { Preset } from '../../domain/model/preset.js';
import { Skill } from '../../domain/model/skill.js';
import { parsePreset } from '../yaml/parse-preset.js';

const PRESET_EXT = '.yaml';
const ARTIFACT_EXT = '.md';

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
}
