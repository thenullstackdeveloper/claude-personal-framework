import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManifestAlreadyExistsError, PresetNotFoundError } from '@claude-fw/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatInitReport, formatInitReportJson, runInit } from './init.command.js';

describe('runInit (CLI command)', () => {
  let framework: string;
  let project: string;

  beforeEach(async () => {
    framework = await mkdtemp(join(tmpdir(), 'cfw-init-fw-'));
    project = await mkdtemp(join(tmpdir(), 'cfw-init-proj-'));
  });

  afterEach(async () => {
    await rm(framework, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  const seedPreset = async (name: string, body = ''): Promise<void> => {
    await mkdir(join(framework, 'presets'), { recursive: true });
    await writeFile(join(framework, 'presets', `${name}.yaml`), body, 'utf-8');
  };

  it('writes .claude-fw.yaml at the project root with the chosen preset', async () => {
    await seedPreset('base');

    const report = await runInit({
      frameworkRoot: framework,
      projectRoot: project,
      presetName: 'base',
    });

    expect(report.presetName).toBe('base');
    expect(report.manifestPath).toBe(join(project, '.claude-fw.yaml'));

    const content = await readFile(report.manifestPath, 'utf-8');
    expect(content).toContain('preset: base');
  });

  it('refuses to overwrite an existing manifest', async () => {
    await seedPreset('base');
    await writeFile(join(project, '.claude-fw.yaml'), 'preset: base\n', 'utf-8');

    await expect(
      runInit({ frameworkRoot: framework, projectRoot: project, presetName: 'base' }),
    ).rejects.toThrow(ManifestAlreadyExistsError);
  });

  it('fails when the preset is not in the catalog', async () => {
    await seedPreset('base');

    await expect(
      runInit({ frameworkRoot: framework, projectRoot: project, presetName: 'nope' }),
    ).rejects.toThrow(PresetNotFoundError);

    // No partial manifest left behind
    await expect(readFile(join(project, '.claude-fw.yaml'), 'utf-8')).rejects.toThrow();
  });
});

describe('formatInitReport (human)', () => {
  it('shows the project, preset and manifest path', () => {
    const out = formatInitReport({
      projectRoot: '/tmp/p',
      presetName: 'base',
      manifestPath: '/tmp/p/.claude-fw.yaml',
    });
    expect(out).toContain('Initialized project at: /tmp/p');
    expect(out).toContain('Preset: base');
    expect(out).toContain('Manifest: /tmp/p/.claude-fw.yaml');
    expect(out).toContain('claude-fw install');
  });
});

describe('formatInitReportJson', () => {
  it('returns valid JSON with all fields', () => {
    const report = {
      projectRoot: '/tmp/p',
      presetName: 'base',
      manifestPath: '/tmp/p/.claude-fw.yaml',
    };
    expect(JSON.parse(formatInitReportJson(report))).toEqual(report);
  });
});
