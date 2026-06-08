import { describe, expect, it } from 'vitest';
import { ArtifactRef } from './artifact-ref.js';
import { AgentId, CommandId, HookName, SkillId } from './identifiers.js';

describe('ArtifactRef', () => {
  describe('constructors', () => {
    it('agent() produces a tagged ref of type agent', () => {
      const ref = ArtifactRef.agent(AgentId.of('docs-manager'));
      expect(ref.type).toBe('agent');
      expect(ref.id.toString()).toBe('docs-manager');
    });

    it('skill() produces a tagged ref of type skill', () => {
      const ref = ArtifactRef.skill(SkillId.of('hexagonal-rn'));
      expect(ref.type).toBe('skill');
    });

    it('command() produces a tagged ref of type command', () => {
      const ref = ArtifactRef.command(CommandId.of('build-android'));
      expect(ref.type).toBe('command');
    });

    it('gitHook() produces a tagged ref of type git-hook', () => {
      const ref = ArtifactRef.gitHook(HookName.of('commit-msg'));
      expect(ref.type).toBe('git-hook');
      if (ref.type === 'git-hook') {
        expect(ref.hookName).toBe('commit-msg');
      }
    });
  });

  describe('equals', () => {
    it('returns true for same type and same id', () => {
      const a = ArtifactRef.agent(AgentId.of('docs-manager'));
      const b = ArtifactRef.agent(AgentId.of('docs-manager'));
      expect(ArtifactRef.equals(a, b)).toBe(true);
    });

    it('returns false for same type but different ids', () => {
      const a = ArtifactRef.agent(AgentId.of('docs-manager'));
      const b = ArtifactRef.agent(AgentId.of('pr-creator'));
      expect(ArtifactRef.equals(a, b)).toBe(false);
    });

    it('returns false for different types even if id strings match', () => {
      const a = ArtifactRef.agent(AgentId.of('foo'));
      const b = ArtifactRef.skill(SkillId.of('foo'));
      expect(ArtifactRef.equals(a, b)).toBe(false);
    });

    it('returns true for two git-hook refs with the same hookName', () => {
      const a = ArtifactRef.gitHook(HookName.of('pre-commit'));
      const b = ArtifactRef.gitHook(HookName.of('pre-commit'));
      expect(ArtifactRef.equals(a, b)).toBe(true);
    });

    it('returns false for two git-hook refs with different hookNames', () => {
      const a = ArtifactRef.gitHook(HookName.of('pre-commit'));
      const b = ArtifactRef.gitHook(HookName.of('pre-push'));
      expect(ArtifactRef.equals(a, b)).toBe(false);
    });

    it('returns false for a git-hook ref vs a non git-hook ref', () => {
      const a = ArtifactRef.gitHook(HookName.of('commit-msg'));
      const b = ArtifactRef.agent(AgentId.of('foo'));
      expect(ArtifactRef.equals(a, b)).toBe(false);
    });
  });
});
