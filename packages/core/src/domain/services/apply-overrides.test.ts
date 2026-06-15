import { describe, expect, it } from 'vitest';
import { ArtifactRef } from '../model/artifact-ref.js';
import { AgentId, CommandId, HookName, PresetName, SkillId } from '../model/identifiers.js';
import { Override } from '../model/override.js';
import { Preset } from '../model/preset.js';
import { applyOverrides } from './apply-overrides.js';

const buildPreset = () =>
  Preset.of({
    name: PresetName.of('react-native'),
    agentIds: [AgentId.of('docs-manager'), AgentId.of('hexagonal-enforcer')],
    skillIds: [SkillId.of('hexagonal-rn')],
    commandIds: [CommandId.of('build-android')],
  });

const buildPresetWithHook = () =>
  Preset.of({
    name: PresetName.of('with-hook'),
    agentIds: [AgentId.of('docs-manager')],
    gitHookNames: [HookName.of('pre-commit')],
  });

describe('applyOverrides', () => {
  it('returns the preset unchanged when there are no overrides', () => {
    const preset = buildPreset();
    const { preset: out, patches } = applyOverrides(preset, []);
    expect(out.agentIds.map(String)).toEqual(['docs-manager', 'hexagonal-enforcer']);
    expect(patches).toEqual([]);
  });

  describe('disable', () => {
    it('removes an agent by id', () => {
      const out = applyOverrides(buildPreset(), [
        Override.disable(ArtifactRef.agent(AgentId.of('hexagonal-enforcer'))),
      ]).preset;
      expect(out.agentIds.map(String)).toEqual(['docs-manager']);
    });

    it('is a no-op if the target is not present', () => {
      const out = applyOverrides(buildPreset(), [
        Override.disable(ArtifactRef.agent(AgentId.of('not-there'))),
      ]).preset;
      expect(out.agentIds.map(String)).toEqual(['docs-manager', 'hexagonal-enforcer']);
    });

    it('removes a skill by id', () => {
      const out = applyOverrides(buildPreset(), [
        Override.disable(ArtifactRef.skill(SkillId.of('hexagonal-rn'))),
      ]).preset;
      expect(out.skillIds).toEqual([]);
    });

    it('removes a command by id', () => {
      const out = applyOverrides(buildPreset(), [
        Override.disable(ArtifactRef.command(CommandId.of('build-android'))),
      ]).preset;
      expect(out.commandIds).toEqual([]);
    });

    it('disable on agent does not touch same-named skill', () => {
      const preset = Preset.of({
        name: PresetName.of('p'),
        agentIds: [AgentId.of('foo')],
        skillIds: [SkillId.of('foo')],
      });
      const out = applyOverrides(preset, [
        Override.disable(ArtifactRef.agent(AgentId.of('foo'))),
      ]).preset;
      expect(out.agentIds).toEqual([]);
      expect(out.skillIds.map(String)).toEqual(['foo']);
    });
  });

  describe('add', () => {
    it('appends a new agent id', () => {
      const out = applyOverrides(buildPreset(), [
        Override.add(ArtifactRef.agent(AgentId.of('legacy-mvc'))),
      ]).preset;
      expect(out.agentIds.map(String)).toEqual([
        'docs-manager',
        'hexagonal-enforcer',
        'legacy-mvc',
      ]);
    });

    it('does not duplicate an existing id', () => {
      const out = applyOverrides(buildPreset(), [
        Override.add(ArtifactRef.agent(AgentId.of('docs-manager'))),
      ]).preset;
      expect(out.agentIds.map(String)).toEqual(['docs-manager', 'hexagonal-enforcer']);
    });
  });

  describe('patch', () => {
    it('collects the patch and leaves ids intact', () => {
      const ref = ArtifactRef.agent(AgentId.of('docs-manager'));
      const { preset: out, patches } = applyOverrides(buildPreset(), [
        Override.patch(ref, 'replacement content'),
      ]);
      expect(out.agentIds.map(String)).toEqual(['docs-manager', 'hexagonal-enforcer']);
      expect(patches).toHaveLength(1);
      const patch = patches[0];
      if (!patch) throw new Error('expected one patch');
      expect(patch.content).toBe('replacement content');
      expect(ArtifactRef.equals(patch.target, ref)).toBe(true);
    });
  });

  it('applies overrides in order: disable then add', () => {
    const out = applyOverrides(buildPreset(), [
      Override.disable(ArtifactRef.agent(AgentId.of('docs-manager'))),
      Override.add(ArtifactRef.agent(AgentId.of('docs-manager'))),
    ]).preset;
    expect(out.agentIds.map(String)).toEqual(['hexagonal-enforcer', 'docs-manager']);
  });

  // git-hooks are NOT patchable / disableable / addable through project
  // overrides in the MVP — the hookName enum is closed and hook content
  // ships with the catalog. The three branches below were no-ops "by
  // comment" until CLAUDEPERS-9 pinned them with tests.
  describe('git-hook targets (no-op)', () => {
    it('disable with a git-hook target leaves gitHookNames untouched and produces no patch', () => {
      const { preset: out, patches } = applyOverrides(buildPresetWithHook(), [
        Override.disable(ArtifactRef.gitHook(HookName.of('pre-commit'))),
      ]);
      expect(out.gitHookNames.map(String)).toEqual(['pre-commit']);
      expect(out.agentIds.map(String)).toEqual(['docs-manager']);
      expect(patches).toEqual([]);
    });

    it('add with a git-hook target leaves gitHookNames untouched and produces no patch', () => {
      const { preset: out, patches } = applyOverrides(buildPresetWithHook(), [
        Override.add(ArtifactRef.gitHook(HookName.of('pre-push'))),
      ]);
      expect(out.gitHookNames.map(String)).toEqual(['pre-commit']);
      expect(patches).toEqual([]);
    });

    it('patch with a git-hook target produces no patch (no zombie entry)', () => {
      // Before this guard landed, the patch slid into the patches array
      // and `buildComposition` silently ignored it downstream. The empty
      // patches[] pins the right behavior at the boundary.
      const { preset: out, patches } = applyOverrides(buildPresetWithHook(), [
        Override.patch(ArtifactRef.gitHook(HookName.of('pre-commit')), 'echo replaced'),
      ]);
      expect(out.gitHookNames.map(String)).toEqual(['pre-commit']);
      expect(patches).toEqual([]);
    });
  });
});
