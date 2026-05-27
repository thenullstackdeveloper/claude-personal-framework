import { describe, expect, it } from 'vitest';
import { InvalidSlugError } from '../errors/domain-error.js';
import { AgentId, CommandId, InstructionsId, PresetName, SkillId } from './identifiers.js';

describe('Slug-based identifiers', () => {
  describe('valid slugs', () => {
    it.each([
      ['docs-manager'],
      ['pr-creator'],
      ['hexagonal-architect'],
      ['a'],
      ['agent-1'],
      ['x-2-y-3'],
    ])('accepts %s', (value) => {
      expect(AgentId.of(value).toString()).toBe(value);
    });
  });

  describe('invalid slugs', () => {
    it.each([
      ['', 'empty string'],
      ['Docs-Manager', 'uppercase'],
      ['docs_manager', 'underscore'],
      ['1agent', 'starts with digit'],
      ['-agent', 'starts with hyphen'],
      ['agent name', 'whitespace'],
      ['agent/foo', 'slash'],
    ])('rejects "%s" (%s)', (value) => {
      expect(() => AgentId.of(value)).toThrow(InvalidSlugError);
    });
  });

  describe('equality', () => {
    it('two AgentId with same value are equal', () => {
      expect(AgentId.of('docs-manager').equals(AgentId.of('docs-manager'))).toBe(true);
    });

    it('two AgentId with different value are not equal', () => {
      expect(AgentId.of('docs-manager').equals(AgentId.of('pr-creator'))).toBe(false);
    });
  });

  describe('nominal typing across kinds', () => {
    it('produces distinct concrete classes per identifier kind', () => {
      const agent = AgentId.of('foo');
      const skill = SkillId.of('foo');
      const command = CommandId.of('foo');
      const preset = PresetName.of('foo');
      const instructions = InstructionsId.of('foo');

      expect(agent).toBeInstanceOf(AgentId);
      expect(skill).toBeInstanceOf(SkillId);
      expect(command).toBeInstanceOf(CommandId);
      expect(preset).toBeInstanceOf(PresetName);
      expect(instructions).toBeInstanceOf(InstructionsId);

      expect(agent).not.toBeInstanceOf(SkillId);
      expect(skill).not.toBeInstanceOf(CommandId);
      expect(instructions).not.toBeInstanceOf(AgentId);
    });
  });
});
