import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDetectReport, formatDetectReportJson, runDetect } from './detect.command.js';

describe('runDetect (CLI command)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cfw-detect-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a framework root', async () => {
    await mkdir(join(dir, 'presets'));
    await mkdir(join(dir, 'agents'));
    const report = await runDetect({ path: dir });
    expect(report.isFramework).toBe(true);
    expect(report.isProject).toBe(false);
  });

  it('detects a project root', async () => {
    await writeFile(join(dir, '.claude-fw.yaml'), 'preset: base', 'utf-8');
    const report = await runDetect({ path: dir });
    expect(report.isProject).toBe(true);
    expect(report.isFramework).toBe(false);
  });

  it('detects a path that is both', async () => {
    await mkdir(join(dir, 'presets'));
    await mkdir(join(dir, 'agents'));
    await writeFile(join(dir, '.claude-fw.yaml'), 'preset: base', 'utf-8');
    const report = await runDetect({ path: dir });
    expect(report.isFramework).toBe(true);
    expect(report.isProject).toBe(true);
  });

  it('detects neither for an empty directory', async () => {
    const report = await runDetect({ path: dir });
    expect(report.isFramework).toBe(false);
    expect(report.isProject).toBe(false);
  });
});

describe('formatDetectReport (human)', () => {
  it('shows yes/no for each role', () => {
    const out = formatDetectReport({ path: '/p', isFramework: true, isProject: false });
    expect(out).toContain('Path: /p');
    expect(out).toContain('Framework root: yes');
    expect(out).toContain('Project root:   no');
  });
});

describe('formatDetectReportJson', () => {
  it('returns valid JSON', () => {
    const report = { path: '/p', isFramework: false, isProject: true };
    expect(JSON.parse(formatDetectReportJson(report))).toEqual(report);
  });
});
