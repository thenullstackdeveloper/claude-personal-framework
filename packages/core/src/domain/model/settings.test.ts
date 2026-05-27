import { describe, expect, it } from 'vitest';
import { type CommandHook, Hooks } from './hooks.js';
import { Settings } from './settings.js';

const cmd = (command: string): CommandHook => ({ type: 'command', command });

describe('Settings', () => {
  describe('empty / isEmpty', () => {
    it('empty() has no permissions and no hooks', () => {
      const s = Settings.empty();
      expect(s.permissions.allow).toEqual([]);
      expect(s.permissions.deny).toEqual([]);
      expect(s.hooks.isEmpty()).toBe(true);
      expect(s.isEmpty()).toBe(true);
    });

    it('is empty when only the permission lists are empty and hooks are empty', () => {
      const s = Settings.of({ allow: [], deny: [] });
      expect(s.isEmpty()).toBe(true);
    });

    it('is not empty when allow has at least one entry', () => {
      expect(Settings.of({ allow: ['Bash(ls)'] }).isEmpty()).toBe(false);
    });

    it('is not empty when hooks has at least one rule', () => {
      const s = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('echo')] }] }),
      });
      expect(s.isEmpty()).toBe(false);
    });
  });

  describe('of', () => {
    it('accepts the legacy flat Permissions shape', () => {
      const s = Settings.of({ allow: ['Bash(ls)'] });
      expect(s.permissions.allow).toEqual(['Bash(ls)']);
      expect(s.permissions.deny).toEqual([]);
      expect(s.hooks.isEmpty()).toBe(true);
    });

    it('accepts a wrapped { permissions, hooks } init', () => {
      const s = Settings.of({
        permissions: { allow: ['x'] },
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('y')] }] }),
      });
      expect(s.permissions.allow).toEqual(['x']);
      expect(s.hooks.isEmpty()).toBe(false);
    });
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
      expect(a.merge(b).permissions.allow).toEqual(['x', 'y', 'z']);
    });

    it('merges the hooks sub-VO too', () => {
      const a = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('a')] }] }),
      });
      const b = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Write', hooks: [cmd('b')] }] }),
      });
      const merged = a.merge(b);
      expect(merged.hooks.get('PreToolUse').map((r) => r.matcher)).toEqual(['Bash', 'Write']);
    });
  });

  describe('equals', () => {
    it('returns true for structurally equal settings (permissions + hooks)', () => {
      const hooks = Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('echo')] }] });
      const a = Settings.of({ permissions: { allow: ['x'] }, hooks });
      const b = Settings.of({ permissions: { allow: ['x'] }, hooks });
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when allow lists differ in order', () => {
      const a = Settings.of({ allow: ['x', 'y'] });
      const b = Settings.of({ allow: ['y', 'x'] });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when hooks differ', () => {
      const a = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('a')] }] }),
      });
      const b = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('b')] }] }),
      });
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toCanonicalJSON / contentHash', () => {
    it('empty settings produces "{}"', () => {
      expect(Settings.empty().toCanonicalJSON()).toBe('{}');
    });

    it('includes permissions when non-empty', () => {
      const s = Settings.of({ allow: ['Bash(ls)'] });
      const json = s.toCanonicalJSON();
      expect(json).toContain('"permissions"');
      expect(json).toContain('Bash(ls)');
    });

    it('includes hooks when non-empty', () => {
      const s = Settings.of({
        hooks: Hooks.of({ PreToolUse: [{ matcher: 'Bash', hooks: [cmd('echo')] }] }),
      });
      expect(s.toCanonicalJSON()).toContain('"hooks"');
      expect(s.toCanonicalJSON()).toContain('PreToolUse');
    });

    it('two equal Settings produce the same canonical JSON regardless of order', () => {
      const a = Settings.of({ allow: ['x', 'y'] });
      const b = Settings.of({ allow: ['x', 'y'] });
      expect(a.toCanonicalJSON()).toBe(b.toCanonicalJSON());
    });

    it('contentHash differs when settings differ', () => {
      const a = Settings.of({ allow: ['x'] });
      const b = Settings.of({ allow: ['y'] });
      expect(a.contentHash().equals(b.contentHash())).toBe(false);
    });

    it('contentHash equals for structurally equal Settings', () => {
      const a = Settings.of({ allow: ['x'] });
      const b = Settings.of({ allow: ['x'] });
      expect(a.contentHash().equals(b.contentHash())).toBe(true);
    });
  });
});
