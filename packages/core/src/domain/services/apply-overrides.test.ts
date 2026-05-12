import { describe, expect, it } from 'vitest';
import { ArtifactRef } from '../model/artifact-ref.js';
import { AgentId, CommandId, PresetName, SkillId } from '../model/identifiers.js';
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
});
