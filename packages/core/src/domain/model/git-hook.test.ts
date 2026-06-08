import { describe, expect, it } from 'vitest';
import { ContentHash } from './content-hash.js';
import { GitHook } from './git-hook.js';
import { HookName } from './identifiers.js';

describe('GitHook', () => {
  it('computes contentHash from the provided content', () => {
    const hook = GitHook.of(HookName.of('commit-msg'), '#!/bin/sh\nexit 0\n');
    expect(hook.contentHash.equals(ContentHash.of('#!/bin/sh\nexit 0\n'))).toBe(true);
  });

  it('preserves the original content verbatim', () => {
    const content = '#!/usr/bin/env bash\necho hi\n';
    const hook = GitHook.of(HookName.of('pre-commit'), content);
    expect(hook.content).toBe(content);
  });

  describe('equality by hookName', () => {
    it('two hooks with the same hookName are equal regardless of content', () => {
      const a = GitHook.of(HookName.of('pre-commit'), 'v1');
      const b = GitHook.of(HookName.of('pre-commit'), 'v2');
      expect(a.equals(b)).toBe(true);
    });

    it('two hooks with different hookNames are not equal even with same content', () => {
      const a = GitHook.of(HookName.of('pre-commit'), 'same');
      const b = GitHook.of(HookName.of('pre-push'), 'same');
      expect(a.equals(b)).toBe(false);
    });
  });
});
