import { describe, expect, it } from 'vitest';
import { CyclicExtendsError, PresetNotFoundError } from '../errors/domain-error.js';
import { AgentId, CommandId, PresetName, SkillId } from '../model/identifiers.js';
import { Preset } from '../model/preset.js';
import { Settings } from '../model/settings.js';
import { resolveExtends } from './resolve-extends.js';

const preset = (
  name: string,
  init: Partial<{
    extends_: string[];
    agents: string[];
    skills: string[];
    commands: string[];
    settings: Settings;
  }> = {},
) =>
  Preset.of({
    name: PresetName.of(name),
    extends_: (init.extends_ ?? []).map((n) => PresetName.of(n)),
    agentIds: (init.agents ?? []).map((n) => AgentId.of(n)),
    skillIds: (init.skills ?? []).map((n) => SkillId.of(n)),
    commandIds: (init.commands ?? []).map((n) => CommandId.of(n)),
    ...(init.settings && { settings: init.settings }),
  });

describe('resolveExtends', () => {
  it('returns a preset with empty extends_ list', () => {
    const base = preset('base');
    const resolved = resolveExtends([base], PresetName.of('base'));
    expect(resolved.extends_).toEqual([]);
  });

  it('inlines a single parent', () => {
    const base = preset('base', { agents: ['docs-manager'] });
    const child = preset('react-native', {
      extends_: ['base'],
      agents: ['rn-bridge'],
    });
    const resolved = resolveExtends([base, child], PresetName.of('react-native'));
    expect(resolved.agentIds.map(String)).toEqual(['docs-manager', 'rn-bridge']);
  });

  it('parent ids come before child ids', () => {
    const base = preset('base', { agents: ['a'] });
    const child = preset('child', { extends_: ['base'], agents: ['b'] });
    const resolved = resolveExtends([base, child], PresetName.of('child'));
    expect(resolved.agentIds.map(String)).toEqual(['a', 'b']);
  });

  it('deduplicates ids that appear in parent and child', () => {
    const base = preset('base', { agents: ['shared'] });
    const child = preset('child', {
      extends_: ['base'],
      agents: ['shared', 'extra'],
    });
    const resolved = resolveExtends([base, child], PresetName.of('child'));
    expect(resolved.agentIds.map(String)).toEqual(['shared', 'extra']);
  });

  it('resolves chains of arbitrary depth', () => {
    const a = preset('a', { agents: ['x'] });
    const b = preset('b', { extends_: ['a'], agents: ['y'] });
    const c = preset('c', { extends_: ['b'], agents: ['z'] });
    const resolved = resolveExtends([a, b, c], PresetName.of('c'));
    expect(resolved.agentIds.map(String)).toEqual(['x', 'y', 'z']);
  });

  it('supports multiple parents (diamond)', () => {
    const base = preset('base', { agents: ['common'] });
    const left = preset('left', { extends_: ['base'], agents: ['l'] });
    const right = preset('right', { extends_: ['base'], agents: ['r'] });
    const bottom = preset('bottom', { extends_: ['left', 'right'], agents: ['b'] });
    const resolved = resolveExtends([base, left, right, bottom], PresetName.of('bottom'));
    expect(resolved.agentIds.map(String)).toEqual(['common', 'l', 'r', 'b']);
  });

  it('merges settings from parent and child', () => {
    const base = preset('base', { settings: Settings.of({ allow: ['Bash(ls)'] }) });
    const child = preset('child', {
      extends_: ['base'],
      settings: Settings.of({ allow: ['Bash(cat)'] }),
    });
    const resolved = resolveExtends([base, child], PresetName.of('child'));
    expect(resolved.settings.permissions.allow).toEqual(['Bash(ls)', 'Bash(cat)']);
  });

  describe('errors', () => {
    it('throws PresetNotFoundError if the target is missing', () => {
      expect(() => resolveExtends([], PresetName.of('missing'))).toThrow(PresetNotFoundError);
    });

    it('throws PresetNotFoundError if a parent is missing', () => {
      const child = preset('child', { extends_: ['nope'] });
      expect(() => resolveExtends([child], PresetName.of('child'))).toThrow(PresetNotFoundError);
    });

    it('throws CyclicExtendsError on a self-reference', () => {
      const a = preset('a', { extends_: ['a'] });
      expect(() => resolveExtends([a], PresetName.of('a'))).toThrow(CyclicExtendsError);
    });

    it('throws CyclicExtendsError on a two-step cycle', () => {
      const a = preset('a', { extends_: ['b'] });
      const b = preset('b', { extends_: ['a'] });
      expect(() => resolveExtends([a, b], PresetName.of('a'))).toThrow(CyclicExtendsError);
    });
  });
});
