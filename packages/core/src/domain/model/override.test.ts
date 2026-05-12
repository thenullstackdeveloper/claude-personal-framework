import { describe, expect, it } from 'vitest';
import { ArtifactRef } from './artifact-ref.js';
import { AgentId } from './identifiers.js';
import { Override } from './override.js';

describe('Override', () => {
  const ref = ArtifactRef.agent(AgentId.of('docs-manager'));

  it('disable() produces a disable override', () => {
    const o = Override.disable(ref);
    expect(o.kind).toBe('disable');
    expect(ArtifactRef.equals(o.target, ref)).toBe(true);
  });

  it('patch() carries replacement content', () => {
    const o = Override.patch(ref, '---\nname: x\n---\n\npatched');
    expect(o.kind).toBe('patch');
    if (o.kind === 'patch') {
      expect(o.content).toBe('---\nname: x\n---\n\npatched');
    }
  });

  it('add() produces an add override', () => {
    const o = Override.add(ref);
    expect(o.kind).toBe('add');
  });

  it('overrides are discriminable by kind', () => {
    const overrides: Override[] = [
      Override.disable(ref),
      Override.patch(ref, 'x'),
      Override.add(ref),
    ];
    const kinds = overrides.map((o) => o.kind);
    expect(kinds).toEqual(['disable', 'patch', 'add']);
  });
});
