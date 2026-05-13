import { describe, expect, it } from 'vitest';
import { InvalidPresetError, InvalidSlugError } from '../../domain/errors/domain-error.js';
import { parsePreset } from './parse-preset.js';

describe('parsePreset', () => {
  it('parses an empty YAML as a preset with no extras', () => {
    const preset = parsePreset('', 'base');
    expect(preset.name.toString()).toBe('base');
    expect(preset.extends_).toEqual([]);
    expect(preset.agentIds).toEqual([]);
    expect(preset.skillIds).toEqual([]);
    expect(preset.commandIds).toEqual([]);
  });

  it('parses a full preset', () => {
    const yaml = `
extends: base
agents:
  - docs-manager
  - pr-creator
skills:
  - hexagonal-rn
commands:
  - build-android
settings:
  permissions:
    allow:
      - "Bash(npx expo*)"
    deny:
      - "Bash(rm*)"
`;
    const preset = parsePreset(yaml, 'react-native');
    expect(preset.name.toString()).toBe('react-native');
    expect(preset.extends_.map(String)).toEqual(['base']);
    expect(preset.agentIds.map(String)).toEqual(['docs-manager', 'pr-creator']);
    expect(preset.skillIds.map(String)).toEqual(['hexagonal-rn']);
    expect(preset.commandIds.map(String)).toEqual(['build-android']);
    expect(preset.settings.permissions.allow).toEqual(['Bash(npx expo*)']);
    expect(preset.settings.permissions.deny).toEqual(['Bash(rm*)']);
  });

  it('accepts "extends" as a single string', () => {
    const preset = parsePreset('extends: base', 'child');
    expect(preset.extends_.map(String)).toEqual(['base']);
  });

  it('accepts "extends" as a list', () => {
    const preset = parsePreset('extends: [a, b]', 'child');
    expect(preset.extends_.map(String)).toEqual(['a', 'b']);
  });

  it('ignores missing optional sections', () => {
    const preset = parsePreset('agents: [docs-manager]', 'p');
    expect(preset.skillIds).toEqual([]);
    expect(preset.commandIds).toEqual([]);
  });

  describe('errors', () => {
    it('rejects YAML that is not a map at root', () => {
      expect(() => parsePreset('- foo\n- bar', 'p')).toThrow(InvalidPresetError);
    });

    it('rejects "agents" that is not a list of strings', () => {
      expect(() => parsePreset('agents: "docs"', 'p')).toThrow(InvalidPresetError);
    });

    it('rejects "extends" that is neither string nor list', () => {
      expect(() => parsePreset('extends: 42', 'p')).toThrow(InvalidPresetError);
    });

    it('rejects malformed YAML with a wrapped error', () => {
      expect(() => parsePreset('agents: [unclosed', 'p')).toThrow(InvalidPresetError);
    });

    it('rejects invalid slugs in agent ids', () => {
      expect(() => parsePreset('agents: ["Bad Name"]', 'p')).toThrow(InvalidSlugError);
    });

    it('rejects "settings.permissions.allow" that is not a list', () => {
      const yaml = `
settings:
  permissions:
    allow: "Bash(ls)"
`;
      expect(() => parsePreset(yaml, 'p')).toThrow(InvalidPresetError);
    });
  });
});
