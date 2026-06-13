import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsCatalogReader } from '@claude-fw/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatListReport, formatListReportJson, runList } from './list.command.js';

describe('runList (CLI command)', () => {
  let framework: string;

  beforeEach(async () => {
    framework = await mkdtemp(join(tmpdir(), 'cfw-list-fw-'));
  });

  afterEach(async () => {
    await rm(framework, { recursive: true, force: true });
  });

  const seed = async (rel: string, content: string): Promise<void> => {
    const full = join(framework, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  };

  it('returns an empty report when the framework is empty', async () => {
    const report = await runList({ catalog: new FsCatalogReader(framework) });
    expect(report.presets).toEqual([]);
    expect(report.agents).toEqual([]);
    expect(report.skills).toEqual([]);
    expect(report.commands).toEqual([]);
    expect(report.instructions).toEqual([]);
  });

  it('returns presets with extends and members', async () => {
    await seed('presets/base.yaml', 'agents: [docs-manager]');
    await seed('presets/nestjs.yaml', 'extends: base\nagents: [hex-refactor]\nskills: [nest-hex]');

    const report = await runList({ catalog: new FsCatalogReader(framework) });

    const byName = Object.fromEntries(report.presets.map((p) => [p.name, p]));
    expect(byName['base']?.agents).toEqual(['docs-manager']);
    expect(byName['nestjs']?.extends).toEqual(['base']);
    expect(byName['nestjs']?.agents).toEqual(['hex-refactor']);
    expect(byName['nestjs']?.skills).toEqual(['nest-hex']);
  });

  it('returns artifacts with frontmatter descriptions', async () => {
    await seed(
      'agents/docs-manager.md',
      '---\nname: docs-manager\ndescription: Manages docs.\n---\nbody',
    );
    await seed('skills/nest-hex.md', '---\ndescription: NestJS hex.\n---\nbody');
    await seed('commands/build.md', '---\ndescription: Build.\n---\nbody');

    const report = await runList({ catalog: new FsCatalogReader(framework) });

    expect(report.agents).toEqual([{ id: 'docs-manager', description: 'Manages docs.' }]);
    expect(report.skills).toEqual([{ id: 'nest-hex', description: 'NestJS hex.' }]);
    expect(report.commands).toEqual([{ id: 'build', description: 'Build.' }]);
  });
});

describe('formatListReport (human)', () => {
  it('shows presets, agents, skills and commands grouped', () => {
    const out = formatListReport({
      presets: [
        {
          name: 'base',
          extends: [],
          agents: ['a', 'b'],
          skills: [],
          commands: [],
          instructions: [],
          gitHooks: [],
        },
        {
          name: 'nestjs',
          extends: ['base'],
          agents: ['c'],
          skills: ['s'],
          commands: [],
          instructions: ['intro'],
          gitHooks: [],
        },
      ],
      agents: [{ id: 'a', description: 'agent a' }],
      skills: [{ id: 's', description: '' }],
      commands: [],
      instructions: [{ id: 'intro', description: '' }],
      gitHooks: [],
    });
    expect(out).toContain('Presets (2):');
    expect(out).toContain('base: 2 agents');
    expect(out).toContain('nestjs (extends base): 1 agents, 1 skills, 1 instructions');
    expect(out).toContain('Agents (1):');
    expect(out).toContain('- a — agent a');
    expect(out).toContain('Skills (1):');
    expect(out).toContain('- s');
    expect(out).toContain('Instructions (1):');
    expect(out).toContain('- intro');
    expect(out).not.toContain('Commands');
    expect(out).not.toContain('Git hooks');
  });

  it('shows a Git hooks section and counts hooks per preset', () => {
    const out = formatListReport({
      presets: [
        {
          name: 'base',
          extends: [],
          agents: [],
          skills: [],
          commands: [],
          instructions: [],
          gitHooks: ['commit-msg', 'pre-commit', 'pre-push'],
        },
      ],
      agents: [],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [{ hookName: 'commit-msg' }, { hookName: 'pre-commit' }, { hookName: 'pre-push' }],
    });
    expect(out).toContain('base: 3 git-hooks');
    expect(out).toContain('Git hooks (3):');
    expect(out).toContain('- commit-msg');
    expect(out).toContain('- pre-commit');
    expect(out).toContain('- pre-push');
  });

  it('shows (empty catalog) when there is nothing', () => {
    const out = formatListReport({
      presets: [],
      agents: [],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [],
    });
    expect(out).toBe('(empty catalog)');
  });
});

describe('formatListReportJson', () => {
  it('returns valid JSON including git hooks', () => {
    const report = {
      presets: [
        {
          name: 'base',
          extends: [],
          agents: ['a'],
          skills: [],
          commands: [],
          instructions: [],
          gitHooks: ['commit-msg'],
        },
      ],
      agents: [{ id: 'a', description: 'desc' }],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [{ hookName: 'commit-msg' }],
    };
    const out = formatListReportJson(report);
    expect(JSON.parse(out)).toEqual(report);
  });
});
