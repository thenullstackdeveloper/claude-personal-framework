import { describe, expect, it } from 'vitest';
import { Agent } from '../model/agent.js';
import { ArtifactRef } from '../model/artifact-ref.js';
import { Command } from '../model/command.js';
import { Composition } from '../model/composition.js';
import { ContentHash } from '../model/content-hash.js';
import { AgentId, CommandId, PresetName, SkillId } from '../model/identifiers.js';
import { Instructions } from '../model/instructions.js';
import { Lockfile } from '../model/lockfile.js';
import { Settings } from '../model/settings.js';
import { Skill } from '../model/skill.js';
import { computeDrift } from './compute-drift.js';

const makeComposition = (
  overrides: {
    agents?: { id: string; content: string }[];
    skills?: { id: string; content: string }[];
    commands?: { id: string; content: string }[];
    instructions?: Instructions;
  } = {},
) => {
  return Composition.of({
    projectPath: '/tmp/p',
    agents: (overrides.agents ?? []).map((a) => Agent.of(AgentId.of(a.id), a.content)),
    skills: (overrides.skills ?? []).map((s) => Skill.of(SkillId.of(s.id), s.content)),
    commands: (overrides.commands ?? []).map((c) => Command.of(CommandId.of(c.id), c.content)),
    settings: Settings.empty(),
    instructions: overrides.instructions ?? Instructions.empty(),
  });
};

const lockfileFor = (
  presetName: string,
  artifacts: { type: 'agent' | 'skill' | 'command'; id: string; content: string }[],
  options: { instructions?: Instructions } = {},
) => {
  return Lockfile.of({
    presetName: PresetName.of(presetName),
    artifacts: artifacts.map((a) => {
      const hash = ContentHash.of(a.content);
      if (a.type === 'agent')
        return { ref: ArtifactRef.agent(AgentId.of(a.id)), contentHash: hash };
      if (a.type === 'skill')
        return { ref: ArtifactRef.skill(SkillId.of(a.id)), contentHash: hash };
      return { ref: ArtifactRef.command(CommandId.of(a.id)), contentHash: hash };
    }),
    settings: Settings.empty(),
    instructions: options.instructions ?? Instructions.empty(),
  });
};

describe('computeDrift', () => {
  describe('no lockfile (first install)', () => {
    it('reports everything in the composition as added', () => {
      const composition = makeComposition({
        agents: [{ id: 'a', content: 'x' }],
        skills: [{ id: 's', content: 'y' }],
      });
      const drift = computeDrift(null, composition);
      expect(drift.added).toHaveLength(2);
      expect(drift.updated).toEqual([]);
      expect(drift.removed).toEqual([]);
      expect(drift.unchanged).toEqual([]);
    });

    it('reports empty added when composition is empty', () => {
      const composition = makeComposition();
      const drift = computeDrift(null, composition);
      expect(drift.added).toEqual([]);
    });
  });

  describe('with lockfile', () => {
    it('reports unchanged when content matches', () => {
      const lockfile = lockfileFor('base', [{ type: 'agent', id: 'a', content: 'same' }]);
      const composition = makeComposition({ agents: [{ id: 'a', content: 'same' }] });
      const drift = computeDrift(lockfile, composition);
      expect(drift.unchanged.map((r) => r.id.toString())).toEqual(['a']);
      expect(drift.added).toEqual([]);
      expect(drift.updated).toEqual([]);
      expect(drift.removed).toEqual([]);
    });

    it('reports updated when content changed', () => {
      const lockfile = lockfileFor('base', [{ type: 'agent', id: 'a', content: 'old' }]);
      const composition = makeComposition({ agents: [{ id: 'a', content: 'new' }] });
      const drift = computeDrift(lockfile, composition);
      expect(drift.updated).toHaveLength(1);
      const update = drift.updated[0];
      if (!update) throw new Error('expected one update');
      expect(update.ref.id.toString()).toBe('a');
      expect(update.oldSha.equals(ContentHash.of('old'))).toBe(true);
      expect(update.newSha.equals(ContentHash.of('new'))).toBe(true);
    });

    it('reports added when a new artifact appears in composition', () => {
      const lockfile = lockfileFor('base', [{ type: 'agent', id: 'old', content: 'x' }]);
      const composition = makeComposition({
        agents: [
          { id: 'old', content: 'x' },
          { id: 'new', content: 'y' },
        ],
      });
      const drift = computeDrift(lockfile, composition);
      expect(drift.added.map((r) => r.id.toString())).toEqual(['new']);
      expect(drift.unchanged.map((r) => r.id.toString())).toEqual(['old']);
    });

    it('reports removed when a lockfile artifact is no longer in composition', () => {
      const lockfile = lockfileFor('base', [
        { type: 'agent', id: 'keep', content: 'x' },
        { type: 'agent', id: 'drop', content: 'y' },
      ]);
      const composition = makeComposition({ agents: [{ id: 'keep', content: 'x' }] });
      const drift = computeDrift(lockfile, composition);
      expect(drift.removed.map((r) => r.id.toString())).toEqual(['drop']);
      expect(drift.unchanged.map((r) => r.id.toString())).toEqual(['keep']);
    });

    it('distinguishes agent foo from skill foo (typed refs)', () => {
      const lockfile = lockfileFor('p', [{ type: 'agent', id: 'foo', content: 'x' }]);
      const composition = makeComposition({ skills: [{ id: 'foo', content: 'x' }] });
      const drift = computeDrift(lockfile, composition);
      expect(drift.added.map((r) => `${r.type}:${r.id.toString()}`)).toEqual(['skill:foo']);
      expect(drift.removed.map((r) => `${r.type}:${r.id.toString()}`)).toEqual(['agent:foo']);
      expect(drift.unchanged).toEqual([]);
    });

    describe('instructions drift', () => {
      it('empty in lockfile, empty in composition → unchanged', () => {
        const lockfile = lockfileFor('p', []);
        const composition = makeComposition({ instructions: Instructions.empty() });
        const drift = computeDrift(lockfile, composition);
        expect(drift.instructions).toEqual({ kind: 'unchanged' });
      });

      it('empty in lockfile, content in composition → added', () => {
        const lockfile = lockfileFor('p', []);
        const composition = makeComposition({ instructions: Instructions.of('hello') });
        const drift = computeDrift(lockfile, composition);
        expect(drift.instructions.kind).toBe('added');
      });

      it('content in lockfile, empty in composition → removed (with oldSha)', () => {
        const previous = Instructions.of('hello');
        const lockfile = lockfileFor('p', [], { instructions: previous });
        const composition = makeComposition({ instructions: Instructions.empty() });
        const drift = computeDrift(lockfile, composition);
        expect(drift.instructions.kind).toBe('removed');
        if (drift.instructions.kind === 'removed') {
          expect(drift.instructions.oldSha.equals(previous.contentHash())).toBe(true);
        }
      });

      it('same content → unchanged', () => {
        const same = Instructions.of('same');
        const lockfile = lockfileFor('p', [], { instructions: same });
        const composition = makeComposition({ instructions: Instructions.of('same') });
        const drift = computeDrift(lockfile, composition);
        expect(drift.instructions).toEqual({ kind: 'unchanged' });
      });

      it('different content → updated (with oldSha and newSha)', () => {
        const previous = Instructions.of('one');
        const lockfile = lockfileFor('p', [], { instructions: previous });
        const next = Instructions.of('other');
        const composition = makeComposition({ instructions: next });
        const drift = computeDrift(lockfile, composition);
        expect(drift.instructions.kind).toBe('updated');
        if (drift.instructions.kind === 'updated') {
          expect(drift.instructions.oldSha.equals(previous.contentHash())).toBe(true);
          expect(drift.instructions.newSha.equals(next.contentHash())).toBe(true);
        }
      });

      it('no lockfile, content in composition → added', () => {
        const composition = makeComposition({ instructions: Instructions.of('first') });
        const drift = computeDrift(null, composition);
        expect(drift.instructions.kind).toBe('added');
      });

      it('no lockfile, empty composition → unchanged', () => {
        const composition = makeComposition();
        const drift = computeDrift(null, composition);
        expect(drift.instructions).toEqual({ kind: 'unchanged' });
      });
    });

    it('handles a mix of all four categories', () => {
      const lockfile = lockfileFor('p', [
        { type: 'agent', id: 'unchanged', content: 'a' },
        { type: 'agent', id: 'updated', content: 'old' },
        { type: 'agent', id: 'removed', content: 'r' },
        { type: 'skill', id: 'unchanged-skill', content: 'b' },
      ]);
      const composition = makeComposition({
        agents: [
          { id: 'unchanged', content: 'a' },
          { id: 'updated', content: 'new' },
          { id: 'added', content: 'fresh' },
        ],
        skills: [{ id: 'unchanged-skill', content: 'b' }],
      });
      const drift = computeDrift(lockfile, composition);
      expect(drift.unchanged.map((r) => r.id.toString()).sort()).toEqual([
        'unchanged',
        'unchanged-skill',
      ]);
      expect(drift.updated.map((u) => u.ref.id.toString())).toEqual(['updated']);
      expect(drift.added.map((r) => r.id.toString())).toEqual(['added']);
      expect(drift.removed.map((r) => r.id.toString())).toEqual(['removed']);
    });
  });
});
