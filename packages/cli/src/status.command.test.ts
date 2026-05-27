import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from './install.command.js';
import { formatStatusReport, formatStatusReportJson, runStatus } from './status.command.js';

describe('runStatus (CLI command)', () => {
  let framework: string;
  let project: string;

  beforeEach(async () => {
    framework = await mkdtemp(join(tmpdir(), 'cfw-status-fw-'));
    project = await mkdtemp(join(tmpdir(), 'cfw-status-proj-'));
  });

  afterEach(async () => {
    await rm(framework, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  const seed = async (rel: string, content: string): Promise<void> => {
    const full = join(framework, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  };

  const seedManifest = async (body: string): Promise<void> => {
    await writeFile(join(project, '.claude-fw.yaml'), body, 'utf-8');
  };

  it('reports hasLockfile=false and adds everything on first call', async () => {
    await seed('presets/base.yaml', 'agents: [a]');
    await seed('agents/a.md', 'body');
    await seedManifest('preset: base');

    const report = await runStatus({ frameworkRoot: framework, projectRoot: project });

    expect(report.hasLockfile).toBe(false);
    expect(report.added.map((a) => a.id)).toEqual(['a']);
    expect(report.updated).toEqual([]);
    expect(report.removed).toEqual([]);
  });

  it('reports no drift after a fresh install', async () => {
    await seed('presets/base.yaml', 'agents: [a]');
    await seed('agents/a.md', 'body');
    await seedManifest('preset: base');

    await runInstall({ frameworkRoot: framework, projectRoot: project });
    const report = await runStatus({ frameworkRoot: framework, projectRoot: project });

    expect(report.hasLockfile).toBe(true);
    expect(report.added).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.unchanged.map((u) => u.id)).toEqual(['a']);
  });

  it('reports updated after an agent file changes in the catalog', async () => {
    await seed('presets/base.yaml', 'agents: [a]');
    await seed('agents/a.md', 'original');
    await seedManifest('preset: base');

    await runInstall({ frameworkRoot: framework, projectRoot: project });
    await seed('agents/a.md', 'modified');

    const report = await runStatus({ frameworkRoot: framework, projectRoot: project });
    expect(report.updated.map((u) => u.id)).toEqual(['a']);
    const update = report.updated[0];
    if (!update) throw new Error('expected one update');
    expect(update.oldSha).not.toBe(update.newSha);
  });

  it('reports removed when an agent is taken out of the preset', async () => {
    await seed('presets/base.yaml', 'agents: [a, b]');
    await seed('agents/a.md', 'x');
    await seed('agents/b.md', 'y');
    await seedManifest('preset: base');

    await runInstall({ frameworkRoot: framework, projectRoot: project });
    await seed('presets/base.yaml', 'agents: [a]');

    const report = await runStatus({ frameworkRoot: framework, projectRoot: project });
    expect(report.removed.map((r) => r.id)).toEqual(['b']);
  });

  it('does not write the lockfile (read-only)', async () => {
    await seed('presets/base.yaml', 'agents: [a]');
    await seed('agents/a.md', 'body');
    await seedManifest('preset: base');

    await runStatus({ frameworkRoot: framework, projectRoot: project });

    // No lockfile should have been created
    await expect(
      runStatus({ frameworkRoot: framework, projectRoot: project }),
    ).resolves.toMatchObject({ hasLockfile: false });
  });
});

describe('formatStatusReport (human)', () => {
  it('shows sections per kind when drift exists', () => {
    const out = formatStatusReport({
      presetName: 'base',
      hasLockfile: true,
      added: [{ type: 'agent', id: 'new' }],
      updated: [{ type: 'agent', id: 'changed', oldSha: 'a'.repeat(64), newSha: 'b'.repeat(64) }],
      removed: [{ type: 'skill', id: 'gone' }],
      unchanged: [{ type: 'command', id: 'stable' }],
      settings: { kind: 'unchanged' },
    });
    expect(out).toContain('Preset: base');
    expect(out).toContain('Lockfile: present');
    expect(out).toContain('Added (1):');
    expect(out).toContain('agent: new');
    expect(out).toContain('Updated (1):');
    expect(out).toContain('Removed (1):');
    expect(out).toContain('skill: gone');
    expect(out).toContain('Unchanged (1):');
  });

  it('says no drift when only unchanged exists', () => {
    const out = formatStatusReport({
      presetName: 'p',
      hasLockfile: true,
      added: [],
      updated: [],
      removed: [],
      unchanged: [{ type: 'agent', id: 'x' }],
      settings: { kind: 'unchanged' },
    });
    expect(out).toContain('No drift');
  });

  it('says first-install when no lockfile is present', () => {
    const out = formatStatusReport({
      presetName: 'p',
      hasLockfile: false,
      added: [{ type: 'agent', id: 'a' }],
      updated: [],
      removed: [],
      unchanged: [],
      settings: { kind: 'unchanged' },
    });
    expect(out).toContain('Lockfile: missing');
    expect(out).toContain('Added (1):');
  });
});

describe('formatStatusReportJson', () => {
  it('returns valid JSON', () => {
    const report = {
      presetName: 'base',
      hasLockfile: true,
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      settings: { kind: 'unchanged' as const },
    };
    expect(JSON.parse(formatStatusReportJson(report))).toEqual(report);
  });
});
