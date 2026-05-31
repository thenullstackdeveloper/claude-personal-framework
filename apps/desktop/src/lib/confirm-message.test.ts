import { describe, expect, it } from 'vitest';
import type { StatusReport } from './api';
import { buildConfirmMessage } from './confirm-message';

const PROJECT = '/tmp/my-project';

const emptyReport = (overrides: Partial<StatusReport> = {}): StatusReport => ({
  presetName: 'base',
  hasLockfile: true,
  added: [],
  updated: [],
  removed: [],
  unchanged: [],
  settings: { kind: 'unchanged' },
  instructions: { kind: 'unchanged' },
  ...overrides,
});

describe('buildConfirmMessage', () => {
  describe('no status available', () => {
    it('falls back to a generic warning about .claude subfolders', () => {
      const msg = buildConfirmMessage(PROJECT, null);
      expect(msg).toContain(`Install into ${PROJECT}?`);
      expect(msg).toContain('replaces .claude/agents, .claude/skills and .claude/commands');
    });
  });

  describe('status with no drift', () => {
    it('says everything already matches and warns about idempotent rewrite', () => {
      const msg = buildConfirmMessage(PROJECT, emptyReport());
      expect(msg).toContain('All artifacts already match the catalog');
      expect(msg).toContain('rewrite them with identical content');
    });
  });

  describe('status with drift', () => {
    it('shows only added when only added is non-empty', () => {
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({ added: [{ type: 'agent', id: 'docs-manager' }] }),
      );
      expect(msg).toContain('Pending changes: +1 added.');
      expect(msg).not.toContain('updated');
      expect(msg).not.toContain('removed');
    });

    it('shows updated alone with tilde prefix', () => {
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({
          updated: [
            { type: 'skill', id: 'rn-hex', oldSha: 'a'.repeat(64), newSha: 'b'.repeat(64) },
          ],
        }),
      );
      expect(msg).toContain('Pending changes: ~1 updated.');
    });

    it('shows removed alone with minus prefix', () => {
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({ removed: [{ type: 'command', id: 'old-cmd' }] }),
      );
      expect(msg).toContain('Pending changes: -1 removed.');
    });

    it('joins all three kinds with commas in fixed order', () => {
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({
          added: [{ type: 'agent', id: 'a' }],
          updated: [
            { type: 'skill', id: 's', oldSha: 'a'.repeat(64), newSha: 'b'.repeat(64) },
            { type: 'agent', id: 'b', oldSha: 'c'.repeat(64), newSha: 'd'.repeat(64) },
          ],
          removed: [
            { type: 'agent', id: 'x' },
            { type: 'agent', id: 'y' },
            { type: 'agent', id: 'z' },
          ],
        }),
      );
      expect(msg).toContain('Pending changes: +1 added, ~2 updated, -3 removed.');
    });

    it('mentions the unchanged count when drift exists', () => {
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({
          added: [{ type: 'agent', id: 'new' }],
          unchanged: [
            { type: 'agent', id: 'kept-1' },
            { type: 'agent', id: 'kept-2' },
          ],
        }),
      );
      expect(msg).toContain('Unchanged artifacts (2) will be rewritten with identical content.');
    });
  });

  describe('settings/instructions singleton drift', () => {
    it('does not count singleton drift toward the "no drift" detection', () => {
      // Documents current behavior: even if settings/instructions drifted,
      // the message says "all artifacts already match" when added/updated/
      // removed are all empty. Extending the message to mention singletons
      // is a behavior change tracked separately.
      const msg = buildConfirmMessage(
        PROJECT,
        emptyReport({
          settings: { kind: 'updated', oldSha: 'a'.repeat(64), newSha: 'b'.repeat(64) },
          instructions: { kind: 'added' },
        }),
      );
      expect(msg).toContain('All artifacts already match the catalog');
    });
  });
});
