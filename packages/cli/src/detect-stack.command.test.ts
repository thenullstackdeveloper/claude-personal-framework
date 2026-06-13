import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsCatalogReader } from '@claude-fw/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatDetectStackReport,
  formatDetectStackReportJson,
  runDetectStack,
} from './detect-stack.command.js';

describe('runDetectStack (CLI command)', () => {
  let catalog: string;
  let project: string;

  beforeEach(async () => {
    catalog = await mkdtemp(join(tmpdir(), 'cfw-detect-cat-'));
    project = await mkdtemp(join(tmpdir(), 'cfw-detect-proj-'));
  });

  afterEach(async () => {
    await rm(catalog, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  const writePreset = async (name: string, body: string): Promise<void> => {
    await mkdir(join(catalog, 'presets'), { recursive: true });
    await writeFile(join(catalog, 'presets', `${name}.yaml`), body, 'utf-8');
  };

  const writePackageJson = async (content: unknown): Promise<void> => {
    await writeFile(join(project, 'package.json'), JSON.stringify(content), 'utf-8');
  };

  it('returns an empty match list when no preset has a detects block', async () => {
    await writePreset('base', '');
    await writePackageJson({ dependencies: { react: '^18' } });

    const report = await runDetectStack({
      catalog: new FsCatalogReader(catalog),
      projectRoot: project,
    });
    expect(report.matches).toEqual([]);
  });

  it('returns matching presets ranked by specificity', async () => {
    await writePreset('react-app', 'detects:\n  - dependencies: [react]\n');
    await writePreset(
      'tauri-rust-react',
      'detects:\n  - dependencies: [react]\n    files: [src-tauri/]\n',
    );
    await writePackageJson({ dependencies: { react: '^18' } });
    await mkdir(join(project, 'src-tauri'), { recursive: true });

    const report = await runDetectStack({
      catalog: new FsCatalogReader(catalog),
      projectRoot: project,
    });
    expect(report.matches.map((m) => m.preset)).toEqual(['tauri-rust-react', 'react-app']);
    expect(report.matches[0]?.specificity).toBe(2);
    expect(report.matches[1]?.specificity).toBe(1);
  });

  it('filters out presets whose rules do not match', async () => {
    await writePreset('nestjs', "detects:\n  - dependencies: ['@nestjs/core']\n");
    await writePreset('react-app', 'detects:\n  - dependencies: [react]\n');
    await writePackageJson({ dependencies: { react: '^18' } });

    const report = await runDetectStack({
      catalog: new FsCatalogReader(catalog),
      projectRoot: project,
    });
    expect(report.matches.map((m) => m.preset)).toEqual(['react-app']);
  });

  it('returns the project root verbatim in the report', async () => {
    await writePreset('base', '');
    const report = await runDetectStack({
      catalog: new FsCatalogReader(catalog),
      projectRoot: project,
    });
    expect(report.projectRoot).toBe(project);
  });
});

describe('formatDetectStackReport (human)', () => {
  it('says no match when matches is empty', () => {
    const out = formatDetectStackReport({ projectRoot: '/p', matches: [] });
    expect(out).toContain('Project: /p');
    expect(out).toContain('No preset matched');
  });

  it('marks the suggested preset when there is a unique winner', () => {
    const out = formatDetectStackReport({
      projectRoot: '/p',
      matches: [
        { preset: 'tauri-rust-react', specificity: 2 },
        { preset: 'react-app', specificity: 1 },
      ],
    });
    expect(out).toContain('Suggested preset: tauri-rust-react');
    expect(out).toContain('specificity 2');
    expect(out).toContain('- tauri-rust-react');
    expect(out).toContain('- react-app');
  });

  it('flags a tie when the top two matches share specificity', () => {
    const out = formatDetectStackReport({
      projectRoot: '/p',
      matches: [
        { preset: 'a', specificity: 1 },
        { preset: 'b', specificity: 1 },
      ],
    });
    expect(out).toContain('tied for highest specificity');
    expect(out).not.toContain('Suggested preset');
  });
});

describe('formatDetectStackReportJson', () => {
  it('returns valid JSON with the matches array', () => {
    const report = {
      projectRoot: '/p',
      matches: [{ preset: 'react-app', specificity: 1 }],
    };
    expect(JSON.parse(formatDetectStackReportJson(report))).toEqual(report);
  });
});
