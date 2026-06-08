import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { GitHook } from '../../domain/model/git-hook.js';
import type { AgentId, CommandId, HookName, SkillId } from '../../domain/model/identifiers.js';
import type { Instructions } from '../../domain/model/instructions.js';
import type { Settings } from '../../domain/model/settings.js';
import type { Skill } from '../../domain/model/skill.js';

export interface WriterPort {
  writeAgent(agent: Agent): Promise<void>;
  writeSkill(skill: Skill): Promise<void>;
  writeCommand(command: Command): Promise<void>;

  deleteAgent(id: AgentId): Promise<void>;
  deleteSkill(id: SkillId): Promise<void>;
  deleteCommand(id: CommandId): Promise<void>;

  /**
   * Materializes the project-level settings (permissions + hooks) as
   * `.claude/settings.json`. The caller is responsible for not calling
   * this with empty `Settings` — use {@link deleteSettings} in that case.
   */
  writeSettings(settings: Settings): Promise<void>;

  /**
   * Removes `.claude/settings.json` if present. Idempotent: no error if
   * the file does not exist.
   */
  deleteSettings(): Promise<void>;

  /**
   * Materializes the project-level instructions as `.claude/CLAUDE.md`.
   * The caller is responsible for not calling this with empty
   * `Instructions` — use {@link deleteInstructions} in that case.
   */
  writeInstructions(instructions: Instructions): Promise<void>;

  /**
   * Removes `.claude/CLAUDE.md` if present. Idempotent: no error if the
   * file does not exist.
   */
  deleteInstructions(): Promise<void>;

  /**
   * Materializes a single git hook as `.githooks/<hookName>` (NOT under
   * `.claude/`). The adapter is responsible for `chmod 0o755` on POSIX
   * platforms; on Windows the execute bit is a no-op.
   */
  writeGitHook(hook: GitHook): Promise<void>;

  /**
   * Removes `.githooks/<hookName>` if present. Idempotent: no error if
   * the file does not exist.
   */
  deleteGitHook(hookName: HookName): Promise<void>;
}
