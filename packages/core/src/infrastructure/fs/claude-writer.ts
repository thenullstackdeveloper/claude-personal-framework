import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WriterPort } from '../../application/ports/writer.port.js';
import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { Skill } from '../../domain/model/skill.js';

const CLAUDE_DIR = '.claude';
const AGENTS_SUBDIR = 'agents';
const SKILLS_SUBDIR = 'skills';
const COMMANDS_SUBDIR = 'commands';
const ARTIFACT_EXT = '.md';

export class ClaudeWriter implements WriterPort {
  constructor(public readonly projectRoot: string) {}

  private claudeDir(): string {
    return join(this.projectRoot, CLAUDE_DIR);
  }

  private artifactDir(subdir: string): string {
    return join(this.claudeDir(), subdir);
  }

  async cleanArtifacts(): Promise<void> {
    await Promise.all([
      rm(this.artifactDir(AGENTS_SUBDIR), { recursive: true, force: true }),
      rm(this.artifactDir(SKILLS_SUBDIR), { recursive: true, force: true }),
      rm(this.artifactDir(COMMANDS_SUBDIR), { recursive: true, force: true }),
    ]);
  }

  async writeAgent(agent: Agent): Promise<void> {
    const dir = this.artifactDir(AGENTS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${agent.id.toString()}${ARTIFACT_EXT}`), agent.content, 'utf-8');
  }

  async writeSkill(skill: Skill): Promise<void> {
    const dir = this.artifactDir(SKILLS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${skill.id.toString()}${ARTIFACT_EXT}`), skill.content, 'utf-8');
  }

  async writeCommand(command: Command): Promise<void> {
    const dir = this.artifactDir(COMMANDS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${command.id.toString()}${ARTIFACT_EXT}`), command.content, 'utf-8');
  }
}
