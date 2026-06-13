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

const baseReport = (overrides: Partial<Parameters<typeof formatInstallReport>[0]> = {}) => ({
  presetName: 'react-native',
  agents: [] as readonly string[],
  skills: [] as readonly string[],
  commands: [] as readonly string[],
  settings: false,
  instructions: false,
  gitHooks: [] as readonly string[],
  gitConfigActivated: false,
  gitConfigCurrent: null as string | null,
  gitConfigSkippedReason: null as 'not-a-git-repo' | null,
  ...overrides,
});

describe('formatInstallReport', () => {
  it('shows a summary with sections per artifact kind', () => {
    const out = formatInstallReport(
      baseReport({ agents: ['docs-manager', 'pr-creator'], skills: ['hexagonal-rn'] }),
    );
    expect(out).toContain('Installed preset "react-native"');
    expect(out).toContain('Agents (2):');
    expect(out).toContain('- docs-manager');
    expect(out).toContain('Skills (1):');
    expect(out).not.toContain('Commands');
  });

  it('shows a friendly line when there is nothing to install', () => {
    const out = formatInstallReport(baseReport({ presetName: 'empty' }));
    expect(out).toContain('(no artifacts to install)');
  });

  it('reports settings when written', () => {
    const out = formatInstallReport(baseReport({ settings: true }));
    expect(out).toContain('Settings: .claude/settings.json written.');
    expect(out).not.toContain('(no artifacts to install)');
  });

  it('reports instructions when written', () => {
    const out = formatInstallReport(baseReport({ instructions: true }));
    expect(out).toContain('Instructions: .claude/CLAUDE.md written.');
    expect(out).not.toContain('(no artifacts to install)');
  });

  describe('git hooks', () => {
    it('lists installed hooks under a "Git hooks" section', () => {
      const out = formatInstallReport(
        baseReport({
          gitHooks: ['commit-msg', 'pre-commit', 'pre-push'],
          gitConfigActivated: true,
          gitConfigCurrent: '.githooks',
        }),
      );
      expect(out).toContain('Git hooks (3):');
      expect(out).toContain('- commit-msg');
      expect(out).toContain('- pre-commit');
      expect(out).toContain('- pre-push');
    });

    it('reports activation when gitConfigActivated is true', () => {
      const out = formatInstallReport(
        baseReport({
          gitHooks: ['commit-msg'],
          gitConfigActivated: true,
          gitConfigCurrent: '.githooks',
        }),
      );
      expect(out).toContain('Git config: set core.hooksPath = .githooks');
    });

    it('reports "left as is" when an existing core.hooksPath value is respected', () => {
      const out = formatInstallReport(
        baseReport({
          gitHooks: ['commit-msg'],
          gitConfigActivated: false,
          gitConfigCurrent: '.my-hooks',
        }),
      );
      expect(out).toContain('Git config: core.hooksPath = .my-hooks — left as is (already set).');
    });

    it('omits the git config line when no hooks are installed', () => {
      const out = formatInstallReport(baseReport({ settings: true }));
      expect(out).not.toContain('core.hooksPath');
    });

    it('hooks count toward the "something installed" check', () => {
      const out = formatInstallReport(baseReport({ gitHooks: ['commit-msg'] }));
      expect(out).not.toContain('(no artifacts to install)');
    });

    it('reports the skipped-not-a-git-repo case with a guidance line', () => {
      const out = formatInstallReport(
        baseReport({
          gitHooks: ['commit-msg'],
          gitConfigActivated: false,
          gitConfigCurrent: null,
          gitConfigSkippedReason: 'not-a-git-repo',
        }),
      );
      expect(out).toContain(
        "Git config: skipped — project is not a git repository (run 'git init' to enable the hooks).",
      );
      // None of the previous git-config lines should also appear.
      expect(out).not.toContain('set core.hooksPath');
      expect(out).not.toContain('left as is');
    });
  });
});

describe('formatInstallReportJson', () => {
  it('returns valid parseable JSON including the git-hooks fields', () => {
    const report = baseReport({
      agents: ['docs-manager', 'pr-creator'],
      skills: ['hexagonal-rn'],
      gitHooks: ['commit-msg'],
      gitConfigActivated: true,
      gitConfigCurrent: '.githooks',
    });
    const out = formatInstallReportJson(report);
    const parsed = JSON.parse(out);
    expect(parsed.gitHooks).toEqual(['commit-msg']);
    expect(parsed.gitConfigActivated).toBe(true);
    expect(parsed.gitConfigCurrent).toBe('.githooks');
  });
});
