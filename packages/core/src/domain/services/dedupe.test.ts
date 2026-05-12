import { describe, expect, it } from 'vitest';
import { AgentId } from '../model/identifiers.js';
import { dedupe } from './dedupe.js';

describe('dedupe', () => {
  it('returns an empty array for an empty input', () => {
    expect(dedupe([])).toEqual([]);
  });

  it('preserves order and removes later duplicates', () => {
    const a = AgentId.of('a');
    const b = AgentId.of('b');
    const c = AgentId.of('c');
    const result = dedupe([a, b, a, c, b]);
    expect(result.map(String)).toEqual(['a', 'b', 'c']);
  });

  it('treats two equal-by-string identifiers as duplicates', () => {
    const a1 = AgentId.of('foo');
    const a2 = AgentId.of('foo');
    expect(dedupe([a1, a2])).toHaveLength(1);
  });

  it('keeps the first occurrence (not the last)', () => {
    const first = AgentId.of('foo');
    const second = AgentId.of('foo');
    const result = dedupe([first, second]);
    expect(result[0]).toBe(first);
  });
});
