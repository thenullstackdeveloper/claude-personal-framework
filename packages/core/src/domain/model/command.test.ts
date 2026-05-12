import { describe, expect, it } from 'vitest';
import { Command } from './command.js';
import { ContentHash } from './content-hash.js';
import { CommandId } from './identifiers.js';

describe('Command', () => {
  it('computes contentHash from content', () => {
    const cmd = Command.of(CommandId.of('build-android'), 'hello');
    expect(cmd.contentHash.equals(ContentHash.of('hello'))).toBe(true);
  });

  it('two commands with same id are equal regardless of content', () => {
    const a = Command.of(CommandId.of('build-android'), 'v1');
    const b = Command.of(CommandId.of('build-android'), 'v2');
    expect(a.equals(b)).toBe(true);
  });

  it('two commands with different ids are not equal', () => {
    const a = Command.of(CommandId.of('build-android'), 'x');
    const b = Command.of(CommandId.of('build-ios'), 'x');
    expect(a.equals(b)).toBe(false);
  });
});
