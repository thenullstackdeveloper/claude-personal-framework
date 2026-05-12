import type { Agent } from './agent.js';
import type { Command } from './command.js';
import type { Settings } from './settings.js';
import type { Skill } from './skill.js';

export type CompositionInit = {
  readonly projectPath: string;
  readonly agents: readonly Agent[];
  readonly skills: readonly Skill[];
  readonly commands: readonly Command[];
  readonly settings: Settings;
};

export class Composition {
  private constructor(
    public readonly projectPath: string,
    public readonly agents: readonly Agent[],
    public readonly skills: readonly Skill[],
    public readonly commands: readonly Command[],
    public readonly settings: Settings,
  ) {}

  static of(init: CompositionInit): Composition {
    return new Composition(
      init.projectPath,
      init.agents,
      init.skills,
      init.commands,
      init.settings,
    );
  }
}
