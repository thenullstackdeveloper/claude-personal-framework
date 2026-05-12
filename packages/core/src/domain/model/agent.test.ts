import { describe, expect, it } from 'vitest';
import { Agent } from './agent.js';
import { ContentHash } from './content-hash.js';
import { AgentId } from './identifiers.js';

describe('Agent', () => {
  it('computes contentHash from the provided content', () => {
    const agent = Agent.of(AgentId.of('docs-manager'), 'hello');
    expect(agent.contentHash.equals(ContentHash.of('hello'))).toBe(true);
  });

  it('preserves the original content verbatim', () => {
    const content = '---\nname: x\n---\n\nbody';
    const agent = Agent.of(AgentId.of('x'), content);
    expect(agent.content).toBe(content);
  });

  describe('equality by identity', () => {
    it('two agents with same id are equal regardless of content', () => {
      const a = Agent.of(AgentId.of('docs-manager'), 'v1');
      const b = Agent.of(AgentId.of('docs-manager'), 'v2');
      expect(a.equals(b)).toBe(true);
    });

    it('two agents with different ids are not equal even with same content', () => {
      const a = Agent.of(AgentId.of('docs-manager'), 'same');
      const b = Agent.of(AgentId.of('pr-creator'), 'same');
      expect(a.equals(b)).toBe(false);
    });
  });
});
