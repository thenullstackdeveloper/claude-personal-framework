import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WriterPort } from '../../application/ports/writer.port.js';
import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { GitHook } from '../../domain/model/git-hook.js';
import type { AgentId, CommandId, HookName, SkillId } from '../../domain/model/identifiers.js';
import type { Instructions } from '../../domain/model/instructions.js';
import type { Settings } from '../../domain/model/settings.js';
import type { Skill } from '../../domain/model/skill.js';
import { isErrnoException } from './fs-helpers.js';

const CLAUDE_DIR = '.claude';
const AGENTS_SUBDIR = 'agents';
const SKILLS_SUBDIR = 'skills';
const COMMANDS_SUBDIR = 'commands';
const ARTIFACT_EXT = '.md';
const SKILL_FILENAME = 'SKILL.md';
const SETTINGS_FILENAME = 'settings.json';
const INSTRUCTIONS_FILENAME = 'CLAUDE.md';
const GITHOOKS_DIR = '.githooks';
const HOOK_EXEC_MODE = 0o755;

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

  private skillDir(id: { toString(): string }): string {
    return join(this.artifactDir(SKILLS_SUBDIR), id.toString());
  }

  private skillFile(id: { toString(): string }): string {
    return join(this.skillDir(id), SKILL_FILENAME);
  }

  async writeSkill(skill: Skill): Promise<void> {
    // Claude Code discovers skills as `.claude/skills/<id>/SKILL.md` —
    // the identifier is the directory name (ADR-0006).
    const dir = this.skillDir(skill.id);
    await mkdir(dir, { recursive: true });
    await writeFile(this.skillFile(skill.id), skill.content, 'utf-8');
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
    // Sweep the whole `<id>/` directory (SKILL.md plus any sibling
    // assets). `force: true` makes ENOENT a no-op.
    await rm(this.skillDir(id), { recursive: true, force: true });
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

  async writeInstructions(instructions: Instructions): Promise<void> {
    const dir = this.claudeDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, INSTRUCTIONS_FILENAME), instructions.content, 'utf-8');
  }

  async deleteInstructions(): Promise<void> {
    try {
      await rm(join(this.claudeDir(), INSTRUCTIONS_FILENAME));
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }

  private gitHookPath(hookName: HookName): string {
    return join(this.projectRoot, GITHOOKS_DIR, hookName);
  }

  async writeGitHook(hook: GitHook): Promise<void> {
    const dir = join(this.projectRoot, GITHOOKS_DIR);
    await mkdir(dir, { recursive: true });
    const path = this.gitHookPath(hook.hookName);
    await writeFile(path, hook.content, 'utf-8');
    // chmod no-op on Windows (NTFS has no POSIX exec bit; git for Windows
    // runs hooks through sh.exe via the shebang regardless). Intentional.
    await chmod(path, HOOK_EXEC_MODE);
  }

  async deleteGitHook(hookName: HookName): Promise<void> {
    try {
      await rm(this.gitHookPath(hookName));
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }
}
