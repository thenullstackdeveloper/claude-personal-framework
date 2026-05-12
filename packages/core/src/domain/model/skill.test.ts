import { describe, expect, it } from 'vitest';
import { ContentHash } from './content-hash.js';
import { SkillId } from './identifiers.js';
import { Skill } from './skill.js';

describe('Skill', () => {
  it('computes contentHash from content', () => {
    const skill = Skill.of(SkillId.of('hexagonal-rn'), 'hello');
    expect(skill.contentHash.equals(ContentHash.of('hello'))).toBe(true);
  });

  it('two skills with same id are equal regardless of content', () => {
    const a = Skill.of(SkillId.of('hexagonal-rn'), 'v1');
    const b = Skill.of(SkillId.of('hexagonal-rn'), 'v2');
    expect(a.equals(b)).toBe(true);
  });

  it('two skills with different ids are not equal', () => {
    const a = Skill.of(SkillId.of('hexagonal-rn'), 'x');
    const b = Skill.of(SkillId.of('expo-eas'), 'x');
    expect(a.equals(b)).toBe(false);
  });
});
