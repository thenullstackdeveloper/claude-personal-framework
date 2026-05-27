import { describe, expect, it } from 'vitest';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { AgentId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { Override } from '../../domain/model/override.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';
import { parseProjectManifest } from './parse-project-manifest.js';
import { serializeProjectManifest } from './serialize-project-manifest.js';

describe('serializeProjectManifest', () => {
  it('emits just the preset field when there are no overrides', () => {
    const manifest: ProjectManifest = {
      presetName: PresetName.of('base'),
      overrides: [],
    };
    const yaml = serializeProjectManifest(manifest);
    expect(yaml).toContain('preset: base');
    expect(yaml).not.toContain('overrides:');
  });

  it('serializes disable / add / patch overrides', () => {
    const manifest: ProjectManifest = {
      presetName: PresetName.of('base'),
      overrides: [
        Override.disable(ArtifactRef.agent(AgentId.of('foo'))),
        Override.add(ArtifactRef.skill(SkillId.of('bar'))),
        Override.patch(ArtifactRef.agent(AgentId.of('baz')), 'replacement body'),
      ],
    };
    const yaml = serializeProjectManifest(manifest);
    expect(yaml).toContain('disable: agent:foo');
    expect(yaml).toContain('add: skill:bar');
    expect(yaml).toContain('patch: agent:baz');
    expect(yaml).toContain('replacement body');
  });

  describe('round-trip with parseProjectManifest', () => {
    it('preserves preset name and override count', () => {
      const original: ProjectManifest = {
        presetName: PresetName.of('nestjs'),
        overrides: [
          Override.disable(ArtifactRef.agent(AgentId.of('docs-manager'))),
          Override.add(ArtifactRef.agent(AgentId.of('legacy-mvc'))),
        ],
      };
      const restored = parseProjectManifest(serializeProjectManifest(original));

      expect(restored.presetName.toString()).toBe('nestjs');
      expect(restored.overrides).toHaveLength(2);
      expect(restored.overrides[0]?.kind).toBe('disable');
      expect(restored.overrides[1]?.kind).toBe('add');
    });

    it('preserves a patch override with multi-line content', () => {
      const original: ProjectManifest = {
        presetName: PresetName.of('base'),
        overrides: [
          Override.patch(ArtifactRef.agent(AgentId.of('a')), '---\nname: a\n---\n\ncustom body'),
        ],
      };
      const restored = parseProjectManifest(serializeProjectManifest(original));
      const patch = restored.overrides[0];
      if (patch?.kind !== 'patch') throw new Error('expected patch override');
      expect(patch.content.trim()).toContain('custom body');
    });

    it('handles a manifest with no overrides through the round trip', () => {
      const original: ProjectManifest = {
        presetName: PresetName.of('react'),
        overrides: [],
      };
      const restored = parseProjectManifest(serializeProjectManifest(original));
      expect(restored.presetName.toString()).toBe('react');
      expect(restored.overrides).toEqual([]);
    });
  });
});
