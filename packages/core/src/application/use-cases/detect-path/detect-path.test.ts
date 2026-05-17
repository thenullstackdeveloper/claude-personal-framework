import { describe, expect, it } from 'vitest';
import type { PathKind, PathProbePort } from '../../ports/path-probe.port.js';
import { detectPath } from './detect-path.use-case.js';

class FakeProbe implements PathProbePort {
  constructor(private readonly bySegment: Record<string, PathKind>) {}

  async inspect(_base: string, segment: string): Promise<PathKind> {
    return this.bySegment[segment] ?? 'missing';
  }
}

describe('detectPath use case', () => {
  it('flags a framework root when presets/ and agents/ are directories', async () => {
    const probe = new FakeProbe({ presets: 'directory', agents: 'directory' });
    const result = await detectPath({ path: '/some/path', probe });
    expect(result.isFramework).toBe(true);
    expect(result.isProject).toBe(false);
  });

  it('does not flag a framework root when only presets/ exists', async () => {
    const probe = new FakeProbe({ presets: 'directory' });
    const result = await detectPath({ path: '/p', probe });
    expect(result.isFramework).toBe(false);
  });

  it('does not flag a framework root when presets is a file, not a directory', async () => {
    const probe = new FakeProbe({ presets: 'file', agents: 'directory' });
    const result = await detectPath({ path: '/p', probe });
    expect(result.isFramework).toBe(false);
  });

  it('flags a project root when .claude-fw.yaml is a file', async () => {
    const probe = new FakeProbe({ '.claude-fw.yaml': 'file' });
    const result = await detectPath({ path: '/p', probe });
    expect(result.isProject).toBe(true);
    expect(result.isFramework).toBe(false);
  });

  it('does not flag a project root when .claude-fw.yaml is a directory', async () => {
    const probe = new FakeProbe({ '.claude-fw.yaml': 'directory' });
    const result = await detectPath({ path: '/p', probe });
    expect(result.isProject).toBe(false);
  });

  it('flags both when a path is a framework root and a project root at once', async () => {
    const probe = new FakeProbe({
      presets: 'directory',
      agents: 'directory',
      '.claude-fw.yaml': 'file',
    });
    const result = await detectPath({ path: '/p', probe });
    expect(result.isFramework).toBe(true);
    expect(result.isProject).toBe(true);
  });

  it('flags neither for an unrelated empty directory', async () => {
    const probe = new FakeProbe({});
    const result = await detectPath({ path: '/p', probe });
    expect(result.isFramework).toBe(false);
    expect(result.isProject).toBe(false);
  });
});
