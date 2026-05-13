import { describe, expect, it } from 'vitest';
import { extractFrontmatterDescription } from './frontmatter.js';

describe('extractFrontmatterDescription', () => {
  it('returns the description from valid frontmatter', () => {
    const md = `---
name: foo
description: This is an agent.
---

body`;
    expect(extractFrontmatterDescription(md)).toBe('This is an agent.');
  });

  it('trims whitespace from the description', () => {
    const md = `---
description: "  spaced out  "
---
body`;
    expect(extractFrontmatterDescription(md)).toBe('spaced out');
  });

  it('returns empty string when there is no frontmatter', () => {
    expect(extractFrontmatterDescription('just markdown, no front matter')).toBe('');
  });

  it('returns empty string when frontmatter has no description', () => {
    const md = `---
name: foo
---
body`;
    expect(extractFrontmatterDescription(md)).toBe('');
  });

  it('returns empty string when frontmatter is malformed YAML', () => {
    const md = `---
description: [unclosed
---
body`;
    expect(extractFrontmatterDescription(md)).toBe('');
  });

  it('handles multi-line descriptions', () => {
    const md = `---
description: |
  First line.
  Second line.
---
body`;
    expect(extractFrontmatterDescription(md)).toBe('First line.\nSecond line.');
  });

  it('returns empty string when description is not a string', () => {
    const md = `---
description: 42
---
body`;
    expect(extractFrontmatterDescription(md)).toBe('');
  });
});
