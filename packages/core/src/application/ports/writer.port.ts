import type { Agent } from '../../domain/model/agent.js';
import type { Command } from '../../domain/model/command.js';
import type { AgentId, CommandId, SkillId } from '../../domain/model/identifiers.js';
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
}
