import { describe, expect, it } from 'vitest';
import { Settings } from './settings.js';

describe('Settings', () => {
  it('empty() has no permissions', () => {
    const s = Settings.empty();
    expect(s.permissions.allow).toEqual([]);
    expect(s.permissions.deny).toEqual([]);
  });

  it('of() fills missing fields with empty arrays', () => {
    const s = Settings.of({ allow: ['Bash(ls)'] });
    expect(s.permissions.allow).toEqual(['Bash(ls)']);
    expect(s.permissions.deny).toEqual([]);
  });

  describe('merge', () => {
    it('concatenates allow and deny lists', () => {
      const a = Settings.of({ allow: ['x'], deny: ['p'] });
      const b = Settings.of({ allow: ['y'], deny: ['q'] });
      const merged = a.merge(b);
      expect(merged.permissions.allow).toEqual(['x', 'y']);
      expect(merged.permissions.deny).toEqual(['p', 'q']);
    });

    it('deduplicates entries preserving first occurrence', () => {
      const a = Settings.of({ allow: ['x', 'y'] });
      const b = Settings.of({ allow: ['y', 'z'] });
      const merged = a.merge(b);
      expect(merged.permissions.allow).toEqual(['x', 'y', 'z']);
    });

    it('is not commutative in input order but produces equal sets', () => {
      const a = Settings.of({ allow: ['x'] });
      const b = Settings.of({ allow: ['y'] });
      expect(a.merge(b).permissions.allow).toEqual(['x', 'y']);
      expect(b.merge(a).permissions.allow).toEqual(['y', 'x']);
    });
  });

  describe('equals', () => {
    it('returns true for structurally equal settings', () => {
      const a = Settings.of({ allow: ['x'], deny: ['p'] });
      const b = Settings.of({ allow: ['x'], deny: ['p'] });
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when allow lists differ in order', () => {
      const a = Settings.of({ allow: ['x', 'y'] });
      const b = Settings.of({ allow: ['y', 'x'] });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when allow lists differ in content', () => {
      const a = Settings.of({ allow: ['x'] });
      const b = Settings.of({ allow: ['y'] });
      expect(a.equals(b)).toBe(false);
    });
  });
});
