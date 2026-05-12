import { describe, expect, it } from 'vitest';
import { InvalidContentHashError } from '../errors/domain-error.js';
import { ContentHash } from './content-hash.js';

describe('ContentHash', () => {
  it('produces deterministic sha256 for the same string', () => {
    const a = ContentHash.of('hello world');
    const b = ContentHash.of('hello world');
    expect(a.equals(b)).toBe(true);
    expect(a.toString()).toBe(b.toString());
  });

  it('produces a 64-char hex digest', () => {
    const hash = ContentHash.of('anything');
    expect(hash.toString()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different content', () => {
    const a = ContentHash.of('foo');
    const b = ContentHash.of('bar');
    expect(a.equals(b)).toBe(false);
  });

  it('matches the known sha256 of an empty string', () => {
    expect(ContentHash.of('').toString()).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('accepts Uint8Array as input', () => {
    const fromString = ContentHash.of('hello');
    const fromBytes = ContentHash.of(new TextEncoder().encode('hello'));
    expect(fromString.equals(fromBytes)).toBe(true);
  });

  describe('fromHex', () => {
    it('round-trips a valid hex digest', () => {
      const original = ContentHash.of('round-trip');
      const restored = ContentHash.fromHex(original.toString());
      expect(restored.equals(original)).toBe(true);
    });

    it.each([
      ['too short', 'abc123'],
      ['uppercase hex', 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'],
      ['non-hex chars', 'g'.repeat(64)],
      ['empty', ''],
    ])('rejects %s', (_label, value) => {
      expect(() => ContentHash.fromHex(value)).toThrow(InvalidContentHashError);
    });
  });
});
