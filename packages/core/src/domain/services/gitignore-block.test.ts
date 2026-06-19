import { describe, expect, it } from 'vitest';
import {
  GITIGNORE_END_MARKER,
  GITIGNORE_START_MARKER,
  computeGitignoreBlock,
} from './gitignore-block.js';

const ENTRIES = ['.claude/agents/', '.claude/skills/', '.githooks/'] as const;

const block = [GITIGNORE_START_MARKER, ...ENTRIES, GITIGNORE_END_MARKER].join('\n');

describe('computeGitignoreBlock', () => {
  it('creates a new file when existing content is null', () => {
    const r = computeGitignoreBlock(null, ENTRIES);
    expect(r.status).toBe('created');
    expect(r.nextContent).toBe(`${block}\n`);
  });

  it('returns unchanged and preserves existing content byte-identically when block matches', () => {
    const existing = `node_modules/\n\n${block}\n`;
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('unchanged');
    expect(r.nextContent).toBe(existing);
  });

  it('replaces the block when entries change, preserving lines outside the markers', () => {
    const staleBlock = [GITIGNORE_START_MARKER, '.claude/old-output/', GITIGNORE_END_MARKER].join(
      '\n',
    );
    const existing = `# user comment\nnode_modules/\n\n${staleBlock}\n\ndist/\n`;
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).toBe(`# user comment\nnode_modules/\n\n${block}\n\ndist/\n`);
  });

  it('appends the block with a blank-line separator when no markers are present', () => {
    const existing = 'node_modules/\ndist/\n';
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).toBe(`node_modules/\ndist/\n\n${block}\n`);
  });

  it('skips the blank-line separator when the existing content is empty', () => {
    const r = computeGitignoreBlock('', ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).toBe(`${block}\n`);
  });

  it('returns block-conflict when two pairs of markers are present', () => {
    const existing = `${block}\n\n${block}\n`;
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('block-conflict');
    expect(r.nextContent).toBe(existing);
  });

  it('returns block-conflict when start/end markers are unbalanced', () => {
    const existing = `${GITIGNORE_START_MARKER}\n.claude/agents/\n`;
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('block-conflict');
    expect(r.nextContent).toBe(existing);
  });

  it('normalizes CRLF input to LF in the output', () => {
    const existing = 'node_modules/\r\ndist/\r\n';
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).not.toContain('\r');
    expect(r.nextContent).toBe(`node_modules/\ndist/\n\n${block}\n`);
  });

  it('ensures a single trailing newline when the existing file has none', () => {
    const existing = 'node_modules/';
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).toBe(`node_modules/\n\n${block}\n`);
  });

  it('collapses multiple trailing newlines into a single one', () => {
    const existing = 'node_modules/\n\n\n\n';
    const r = computeGitignoreBlock(existing, ENTRIES);
    expect(r.status).toBe('updated');
    expect(r.nextContent).toBe(`node_modules/\n\n${block}\n`);
  });
});
