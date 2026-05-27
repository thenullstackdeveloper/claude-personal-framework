import { describe, expect, it } from 'vitest';
import { Instructions } from './instructions.js';

describe('Instructions VO', () => {
  describe('empty / of', () => {
    it('empty() has zero-length content and isEmpty', () => {
      const i = Instructions.empty();
      expect(i.content).toBe('');
      expect(i.isEmpty()).toBe(true);
    });

    it('of(content) preserves content verbatim', () => {
      const i = Instructions.of('Some text\nwith newlines.');
      expect(i.content).toBe('Some text\nwith newlines.');
      expect(i.isEmpty()).toBe(false);
    });

    it('isEmpty is strict: a whitespace-only content is NOT empty', () => {
      expect(Instructions.of(' ').isEmpty()).toBe(false);
      expect(Instructions.of('\n').isEmpty()).toBe(false);
    });
  });

  describe('append', () => {
    it('empty + empty = empty', () => {
      const r = Instructions.empty().append(Instructions.empty());
      expect(r.isEmpty()).toBe(true);
    });

    it('empty + x = x (no leading separator)', () => {
      const r = Instructions.empty().append(Instructions.of('a'));
      expect(r.content).toBe('a');
    });

    it('x + empty = x (no trailing separator)', () => {
      const r = Instructions.of('a').append(Instructions.empty());
      expect(r.content).toBe('a');
    });

    it('x + y joins with a blank-line separator', () => {
      const r = Instructions.of('a').append(Instructions.of('b'));
      expect(r.content).toBe('a\n\nb');
    });

    it('chains in order: a.append(b).append(c) = a\\n\\nb\\n\\nc', () => {
      const r = Instructions.of('a').append(Instructions.of('b')).append(Instructions.of('c'));
      expect(r.content).toBe('a\n\nb\n\nc');
    });

    it('reducing from empty yields the same canonical concatenation', () => {
      const parts = [Instructions.of('a'), Instructions.of('b'), Instructions.of('c')];
      const r = parts.reduce((acc, p) => acc.append(p), Instructions.empty());
      expect(r.content).toBe('a\n\nb\n\nc');
    });

    it('does not mutate the receivers', () => {
      const a = Instructions.of('a');
      const b = Instructions.of('b');
      a.append(b);
      expect(a.content).toBe('a');
      expect(b.content).toBe('b');
    });
  });

  describe('equals', () => {
    it('two Instructions with same content are equal', () => {
      expect(Instructions.of('hello').equals(Instructions.of('hello'))).toBe(true);
    });

    it('different content → not equal', () => {
      expect(Instructions.of('hello').equals(Instructions.of('world'))).toBe(false);
    });

    it('empty equals empty', () => {
      expect(Instructions.empty().equals(Instructions.empty())).toBe(true);
    });
  });

  describe('contentHash', () => {
    it('same content → same hash', () => {
      const a = Instructions.of('same').contentHash();
      const b = Instructions.of('same').contentHash();
      expect(a.toString()).toBe(b.toString());
    });

    it('different content → different hash', () => {
      const a = Instructions.of('one').contentHash();
      const b = Instructions.of('other').contentHash();
      expect(a.toString()).not.toBe(b.toString());
    });

    it('empty has a stable hash distinct from non-empty', () => {
      const e = Instructions.empty().contentHash().toString();
      const x = Instructions.of('x').contentHash().toString();
      expect(e).not.toBe(x);
      // 64-char hex (sha-256)
      expect(e).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
