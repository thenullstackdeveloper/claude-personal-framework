import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WriterPort } from '../../application/ports/writer.port.js';
import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { AgentId, CommandId, SkillId } from '../../domain/model/identifiers.js';
import type { Settings } from '../../domain/model/settings.js';
import type { Skill } from '../../domain/model/skill.js';

const CLAUDE_DIR = '.claude';
const AGENTS_SUBDIR = 'agents';
const SKILLS_SUBDIR = 'skills';
const COMMANDS_SUBDIR = 'commands';
const ARTIFACT_EXT = '.md';
const SETTINGS_FILENAME = 'settings.json';

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};

export class ClaudeWriter implements WriterPort {
  constructor(public readonly projectRoot: string) {}

  private claudeDir(): string {
    return join(this.projectRoot, CLAUDE_DIR);
  }

  private artifactDir(subdir: string): string {
    return join(this.claudeDir(), subdir);
  }

  private artifactPath(subdir: string, id: { toString(): string }): string {
    return join(this.artifactDir(subdir), `${id.toString()}${ARTIFACT_EXT}`);
  }

  private async writeArtifact(subdir: string, filename: string, content: string): Promise<void> {
    const dir = this.artifactDir(subdir);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), content, 'utf-8');
  }

  private async deleteArtifact(subdir: string, id: { toString(): string }): Promise<void> {
    try {
      await rm(this.artifactPath(subdir, id));
    } catch (err) {
      // Ignore ENOENT — caller wanted it gone, it already is.
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }

  async writeAgent(agent: Agent): Promise<void> {
    return this.writeArtifact(
      AGENTS_SUBDIR,
      `${agent.id.toString()}${ARTIFACT_EXT}`,
      agent.content,
    );
  }

  async writeSkill(skill: Skill): Promise<void> {
    return this.writeArtifact(
      SKILLS_SUBDIR,
      `${skill.id.toString()}${ARTIFACT_EXT}`,
      skill.content,
    );
  }

  async writeCommand(command: Command): Promise<void> {
    return this.writeArtifact(
      COMMANDS_SUBDIR,
      `${command.id.toString()}${ARTIFACT_EXT}`,
      command.content,
    );
  }

  async deleteAgent(id: AgentId): Promise<void> {
    return this.deleteArtifact(AGENTS_SUBDIR, id);
  }

  async deleteSkill(id: SkillId): Promise<void> {
    return this.deleteArtifact(SKILLS_SUBDIR, id);
  }

  async deleteCommand(id: CommandId): Promise<void> {
    return this.deleteArtifact(COMMANDS_SUBDIR, id);
  }

  async writeSettings(settings: Settings): Promise<void> {
    const dir = this.claudeDir();
    await mkdir(dir, { recursive: true });
    const payload: Record<string, unknown> = {};
    const { permissions, hooks } = settings;
    if (permissions.allow.length > 0 || permissions.deny.length > 0) {
      payload['permissions'] = {
        allow: permissions.allow,
        deny: permissions.deny,
      };
    }
    if (!hooks.isEmpty()) {
      payload['hooks'] = hooks.toObject();
    }
    await writeFile(join(dir, SETTINGS_FILENAME), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  async deleteSettings(): Promise<void> {
    try {
      await rm(join(this.claudeDir(), SETTINGS_FILENAME));
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }
}
