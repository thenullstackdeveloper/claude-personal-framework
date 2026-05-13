import { describe, expect, it } from 'vitest';
import { InvalidProjectManifestError } from '../../domain/errors/domain-error.js';
import { parseProjectManifest } from './parse-project-manifest.js';

describe('parseProjectManifest', () => {
  it('parses a minimal manifest with just a preset', () => {
    const manifest = parseProjectManifest('preset: nestjs');
    expect(manifest.presetName.toString()).toBe('nestjs');
    expect(manifest.overrides).toEqual([]);
  });

  it('parses a disable override', () => {
    const yaml = `
preset: nestjs
overrides:
  - disable: agent:hexagonal-enforcer
`;
    const { overrides } = parseProjectManifest(yaml);
    expect(overrides).toHaveLength(1);
    const o = overrides[0];
    if (!o || o.kind !== 'disable') throw new Error('expected disable override');
    expect(o.target.type).toBe('agent');
    expect(o.target.id.toString()).toBe('hexagonal-enforcer');
  });

  it('parses an add override', () => {
    const yaml = `
preset: nestjs
overrides:
  - add: skill:legacy-mvc
`;
    const { overrides } = parseProjectManifest(yaml);
    const o = overrides[0];
    if (!o || o.kind !== 'add') throw new Error('expected add override');
    expect(o.target.type).toBe('skill');
    expect(o.target.id.toString()).toBe('legacy-mvc');
  });

  it('parses a patch override with content', () => {
    const yaml = `
preset: nestjs
overrides:
  - patch: agent:docs-manager
    content: |
      ---
      name: docs-manager
      ---

      custom body
`;
    const { overrides } = parseProjectManifest(yaml);
    const o = overrides[0];
    if (!o || o.kind !== 'patch') throw new Error('expected patch override');
    expect(o.target.id.toString()).toBe('docs-manager');
    expect(o.content).toContain('custom body');
  });

  it('parses multiple overrides preserving order', () => {
    const yaml = `
preset: p
overrides:
  - disable: agent:a
  - add: agent:b
  - disable: skill:c
`;
    const { overrides } = parseProjectManifest(yaml);
    expect(overrides.map((o) => o.kind)).toEqual(['disable', 'add', 'disable']);
  });

  it('accepts artifact refs for all three kinds', () => {
    const yaml = `
preset: p
overrides:
  - disable: agent:a
  - disable: skill:b
  - disable: command:c
`;
    const { overrides } = parseProjectManifest(yaml);
    expect(overrides.map((o) => o.target.type)).toEqual(['agent', 'skill', 'command']);
  });

  describe('errors', () => {
    it('rejects a missing preset field', () => {
      expect(() => parseProjectManifest('overrides: []')).toThrow(InvalidProjectManifestError);
    });

    it('rejects a non-string preset value', () => {
      expect(() => parseProjectManifest('preset: 42')).toThrow(InvalidProjectManifestError);
    });

    it('rejects overrides that is not a list', () => {
      expect(() => parseProjectManifest('preset: p\noverrides: not-a-list')).toThrow(
        InvalidProjectManifestError,
      );
    });

    it('rejects an override missing disable/add/patch keys', () => {
      const yaml = `
preset: p
overrides:
  - somethingElse: agent:foo
`;
      expect(() => parseProjectManifest(yaml)).toThrow(InvalidProjectManifestError);
    });

    it('rejects a patch override without content', () => {
      const yaml = `
preset: p
overrides:
  - patch: agent:foo
`;
      expect(() => parseProjectManifest(yaml)).toThrow(InvalidProjectManifestError);
    });

    it('rejects an artifact ref without colon', () => {
      const yaml = `
preset: p
overrides:
  - disable: docs-manager
`;
      expect(() => parseProjectManifest(yaml)).toThrow(InvalidProjectManifestError);
    });

    it('rejects an unknown artifact type', () => {
      const yaml = `
preset: p
overrides:
  - disable: widget:foo
`;
      expect(() => parseProjectManifest(yaml)).toThrow(InvalidProjectManifestError);
    });

    it('rejects malformed YAML', () => {
      expect(() => parseProjectManifest('preset: [unclosed')).toThrow(InvalidProjectManifestError);
    });
  });
});
