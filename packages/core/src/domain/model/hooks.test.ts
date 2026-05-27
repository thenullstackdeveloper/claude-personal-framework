import { describe, expect, it } from 'vitest';
import { type CommandHook, type HookRule, Hooks } from './hooks.js';

const cmd = (command: string, timeout?: number): CommandHook =>
  timeout === undefined ? { type: 'command', command } : { type: 'command', command, timeout };

const rule = (matcher: string, ...hooks: CommandHook[]): HookRule => ({ matcher, hooks });

describe('Hooks', () => {
  describe('empty / isEmpty', () => {
    it('reports empty when constructed via empty()', () => {
      expect(Hooks.empty().isEmpty()).toBe(true);
    });

    it('reports empty when constructed with no rules', () => {
      expect(Hooks.of({}).isEmpty()).toBe(true);
    });

    it('reports empty when an event has an empty array', () => {
      expect(Hooks.of({ PreToolUse: [] }).isEmpty()).toBe(true);
    });

    it('reports non-empty when at least one rule exists', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('echo'))] });
      expect(h.isEmpty()).toBe(false);
    });
  });

  describe('of / get / events', () => {
    it('lists events in canonical order regardless of insertion', () => {
      const h = Hooks.of({
        Stop: [rule('', cmd('s'))],
        PreToolUse: [rule('Bash', cmd('p'))],
      });
      expect(h.events()).toEqual(['PreToolUse', 'Stop']);
    });

    it('returns an empty rule list for unset events', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('x'))] });
      expect(h.get('PostToolUse')).toEqual([]);
    });

    it('dedupes structurally identical rules on construction', () => {
      const r = rule('Bash', cmd('echo'));
      const h = Hooks.of({ PreToolUse: [r, { ...r }] });
      expect(h.get('PreToolUse')).toHaveLength(1);
    });
  });

  describe('merge', () => {
    it('concatenates rules within each event, parent first', () => {
      const a = Hooks.of({ PreToolUse: [rule('Bash', cmd('a'))] });
      const b = Hooks.of({ PreToolUse: [rule('Write', cmd('b'))] });
      const merged = a.merge(b);
      expect(merged.get('PreToolUse').map((r) => r.matcher)).toEqual(['Bash', 'Write']);
    });

    it('preserves rules in events that only appear in one side', () => {
      const a = Hooks.of({ PreToolUse: [rule('Bash', cmd('a'))] });
      const b = Hooks.of({ Stop: [rule('', cmd('s'))] });
      const merged = a.merge(b);
      expect(merged.events()).toEqual(['PreToolUse', 'Stop']);
    });

    it('dedupes when both sides declare an identical rule', () => {
      const r = rule('Bash', cmd('echo'));
      const a = Hooks.of({ PreToolUse: [r] });
      const b = Hooks.of({ PreToolUse: [{ ...r }] });
      const merged = a.merge(b);
      expect(merged.get('PreToolUse')).toHaveLength(1);
    });

    it('keeps both when matchers match but command differs', () => {
      const a = Hooks.of({ PreToolUse: [rule('Bash', cmd('one'))] });
      const b = Hooks.of({ PreToolUse: [rule('Bash', cmd('two'))] });
      expect(a.merge(b).get('PreToolUse')).toHaveLength(2);
    });

    it('keeps both when matchers differ but command matches', () => {
      const a = Hooks.of({ PreToolUse: [rule('Bash', cmd('echo'))] });
      const b = Hooks.of({ PreToolUse: [rule('Write', cmd('echo'))] });
      expect(a.merge(b).get('PreToolUse')).toHaveLength(2);
    });

    it('merging with empty yields self (canonical equality)', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('x'))] });
      expect(h.merge(Hooks.empty()).equals(h)).toBe(true);
      expect(Hooks.empty().merge(h).equals(h)).toBe(true);
    });
  });

  describe('equals / toCanonicalJSON', () => {
    it('is stable regardless of construction order', () => {
      const a = Hooks.of({
        Stop: [rule('', cmd('s'))],
        PreToolUse: [rule('Bash', cmd('p'))],
      });
      const b = Hooks.of({
        PreToolUse: [rule('Bash', cmd('p'))],
        Stop: [rule('', cmd('s'))],
      });
      expect(a.equals(b)).toBe(true);
      expect(a.toCanonicalJSON()).toBe(b.toCanonicalJSON());
    });

    it('includes timeout when set', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('x', 30))] });
      expect(h.toCanonicalJSON()).toContain('"timeout":30');
    });

    it('omits timeout when not set', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('x'))] });
      expect(h.toCanonicalJSON()).not.toContain('timeout');
    });

    it('different content produces different canonical JSON', () => {
      const a = Hooks.of({ PreToolUse: [rule('Bash', cmd('a'))] });
      const b = Hooks.of({ PreToolUse: [rule('Bash', cmd('b'))] });
      expect(a.toCanonicalJSON()).not.toBe(b.toCanonicalJSON());
    });
  });

  describe('toObject', () => {
    it('returns only the events with rules', () => {
      const h = Hooks.of({ PreToolUse: [rule('Bash', cmd('x'))] });
      const obj = h.toObject();
      expect(Object.keys(obj)).toEqual(['PreToolUse']);
      expect(obj['PreToolUse']?.[0]?.matcher).toBe('Bash');
    });
  });
});
