import { describe, expect, it } from 'vitest';
import { shortenSha } from './sha';

describe('shortenSha', () => {
  it('truncates a 64-char sha to 12 chars + ellipsis by default', () => {
    const sha = 'a'.repeat(64);
    expect(shortenSha(sha)).toBe(`${'a'.repeat(12)}…`);
  });

  it('respects a custom length', () => {
    const sha = 'b'.repeat(64);
    expect(shortenSha(sha, 7)).toBe(`${'b'.repeat(7)}…`);
  });

  it('returns input unchanged when shorter than the limit', () => {
    expect(shortenSha('short')).toBe('short');
  });

  it('does not append ellipsis when length equals the limit exactly', () => {
    const sha = 'c'.repeat(12);
    expect(shortenSha(sha)).toBe('c'.repeat(12));
  });
});
