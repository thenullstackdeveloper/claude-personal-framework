import { describe, expect, it } from 'vitest';
import { AgentId, CommandId, HookName, PresetName, SkillId } from './identifiers.js';
import { Preset } from './preset.js';
import { Settings } from './settings.js';

describe('Preset', () => {
  it('fills missing collections with empty arrays and empty settings', () => {
    const preset = Preset.of({ name: PresetName.of('base') });
    expect(preset.name.toString()).toBe('base');
    expect(preset.extends_).toEqual([]);
    expect(preset.agentIds).toEqual([]);
    expect(preset.skillIds).toEqual([]);
    expect(preset.commandIds).toEqual([]);
    expect(preset.gitHookNames).toEqual([]);
    expect(preset.settings.equals(Settings.empty())).toBe(true);
  });

  it('preserves the provided collections', () => {
    const preset = Preset.of({
      name: PresetName.of('react-native'),
      extends_: [PresetName.of('base')],
      agentIds: [AgentId.of('docs-manager'), AgentId.of('pr-creator')],
      skillIds: [SkillId.of('hexagonal-rn')],
      commandIds: [CommandId.of('build-android')],
      gitHookNames: [HookName.of('commit-msg'), HookName.of('pre-commit')],
      settings: Settings.of({ allow: ['Bash(npx expo*)'] }),
    });

    expect(preset.extends_.map(String)).toEqual(['base']);
    expect(preset.agentIds.map(String)).toEqual(['docs-manager', 'pr-creator']);
    expect(preset.skillIds.map(String)).toEqual(['hexagonal-rn']);
    expect(preset.commandIds.map(String)).toEqual(['build-android']);
    expect(preset.gitHookNames).toEqual(['commit-msg', 'pre-commit']);
    expect(preset.settings.permissions.allow).toEqual(['Bash(npx expo*)']);
  });

  describe('equality by name', () => {
    it('two presets with same name are equal even with different content', () => {
      const a = Preset.of({ name: PresetName.of('base') });
      const b = Preset.of({
        name: PresetName.of('base'),
        agentIds: [AgentId.of('docs-manager')],
      });
      expect(a.equals(b)).toBe(true);
    });

    it('two presets with different names are not equal', () => {
      const a = Preset.of({ name: PresetName.of('base') });
      const b = Preset.of({ name: PresetName.of('react-native') });
      expect(a.equals(b)).toBe(false);
    });
  });
});
