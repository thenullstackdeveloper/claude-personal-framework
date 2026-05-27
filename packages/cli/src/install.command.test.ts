import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatInstallReport, formatInstallReportJson, runInstall } from './install.command.js';

describe('runInstall (CLI command)', () => {
  let framework: string;
  let project: string;

  beforeEach(async () => {
    framework = await mkdtemp(join(tmpdir(), 'cfw-e2e-fw-'));
    project = await mkdtemp(join(tmpdir(), 'cfw-e2e-proj-'));
  });

  afterEach(async () => {
    await rm(framework, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  const seedFramework = async (layout: {
    presets?: Record<string, string>;
    agents?: Record<string, string>;
  }): Promise<void> => {
    for (const [name, body] of Object.entries(layout.presets ?? {})) {
      await mkdir(join(framework, 'presets'), { recursive: true });
      await writeFile(join(framework, 'presets', `${name}.yaml`), body, 'utf-8');
    }
    for (const [id, body] of Object.entries(layout.agents ?? {})) {
      await mkdir(join(framework, 'agents'), { recursive: true });
      await writeFile(join(framework, 'agents', `${id}.md`), body, 'utf-8');
    }
  };

  const seedProjectManifest = async (body: string): Promise<void> => {
    await writeFile(join(project, '.claude-fw.yaml'), body, 'utf-8');
  };

  it('installs a preset end-to-end and writes .claude/agents/', async () => {
    await seedFramework({
      presets: { base: 'agents: [docs-manager]' },
      agents: { 'docs-manager': '---\nname: docs-manager\n---\n\nbody' },
    });
    await seedProjectManifest('preset: base');

    const report = await runInstall({ frameworkRoot: framework, projectRoot: project });

    expect(report.presetName).toBe('base');
    expect(report.agents).toEqual(['docs-manager']);

    const written = await readFile(join(project, '.claude', 'agents', 'docs-manager.md'), 'utf-8');
    expect(written).toContain('name: docs-manager');
  });

  it('honors disable overrides from the project manifest', async () => {
    await seedFramework({
      presets: { base: 'agents: [keep, drop]' },
      agents: { keep: 'k', drop: 'd' },
    });
    await seedProjectManifest(`
preset: base
overrides:
  - disable: agent:drop
`);

    const report = await runInstall({ frameworkRoot: framework, projectRoot: project });
    expect(report.agents).toEqual(['keep']);
  });

  it('applies patch overrides to the installed content', async () => {
    await seedFramework({
      presets: { base: 'agents: [docs-manager]' },
      agents: { 'docs-manager': 'original content' },
    });
    await seedProjectManifest(`
preset: base
overrides:
  - patch: agent:docs-manager
    content: |
      patched content
`);

    await runInstall({ frameworkRoot: framework, projectRoot: project });

    const written = await readFile(join(project, '.claude', 'agents', 'docs-manager.md'), 'utf-8');
    expect(written.trim()).toBe('patched content');
  });

  it('throws a useful error when the manifest is missing', async () => {
    await expect(runInstall({ frameworkRoot: framework, projectRoot: project })).rejects.toThrow(
      /No \.claude-fw\.yaml found.+claude-fw init/,
    );
  });
});

describe('formatInstallReport', () => {
  it('shows a summary with sections per artifact kind', () => {
    const out = formatInstallReport({
      presetName: 'react-native',
      agents: ['docs-manager', 'pr-creator'],
      skills: ['hexagonal-rn'],
      commands: [],
    });
    expect(out).toContain('Installed preset "react-native"');
    expect(out).toContain('Agents (2):');
    expect(out).toContain('- docs-manager');
    expect(out).toContain('Skills (1):');
    expect(out).not.toContain('Commands');
  });

  it('shows a friendly line when there is nothing to install', () => {
    const out = formatInstallReport({
      presetName: 'empty',
      agents: [],
      skills: [],
      commands: [],
    });
    expect(out).toContain('(no artifacts to install)');
  });
});

describe('formatInstallReportJson', () => {
  it('returns valid parseable JSON', () => {
    const report = {
      presetName: 'react-native',
      agents: ['docs-manager', 'pr-creator'],
      skills: ['hexagonal-rn'],
      commands: [],
    };
    const out = formatInstallReportJson(report);
    expect(JSON.parse(out)).toEqual(report);
  });
});
