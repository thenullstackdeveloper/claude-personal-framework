import { describe, expect, it } from 'vitest';
import { Agent } from './agent.js';
import { Command } from './command.js';
import { Composition } from './composition.js';
import { AgentId, CommandId, SkillId } from './identifiers.js';
import { Instructions } from './instructions.js';
import { Settings } from './settings.js';
import { Skill } from './skill.js';

describe('Composition', () => {
  it('preserves the provided artifacts and project path', () => {
    const composition = Composition.of({
      projectPath: '/tmp/project',
      agents: [Agent.of(AgentId.of('docs-manager'), 'agent body')],
      skills: [Skill.of(SkillId.of('hexagonal-rn'), 'skill body')],
      commands: [Command.of(CommandId.of('build-android'), 'cmd body')],
      settings: Settings.of({ allow: ['Bash(ls)'] }),
      instructions: Instructions.empty(),
    });

    expect(composition.projectPath).toBe('/tmp/project');
    expect(composition.agents).toHaveLength(1);
    expect(composition.skills).toHaveLength(1);
    expect(composition.commands).toHaveLength(1);
    expect(composition.settings.permissions.allow).toEqual(['Bash(ls)']);
  });
});
