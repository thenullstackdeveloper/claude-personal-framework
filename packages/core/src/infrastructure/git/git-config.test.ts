import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChildProcessGitConfig } from './git-config.js';

const runGit = (args: readonly string[], cwd: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });

describe('ChildProcessGitConfig', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'cfw-gitconfig-'));
    // -q so test output stays clean; default branch name irrelevant.
    const code = await runGit(['init', '-q'], repo);
    if (code !== 0) throw new Error(`git init failed with code ${code}`);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('getHooksPath returns null when the setting is unset', async () => {
    const cfg = new ChildProcessGitConfig(repo);
    expect(await cfg.getHooksPath()).toBeNull();
  });

  it('setHooksPath writes the value and getHooksPath reads it back', async () => {
    const cfg = new ChildProcessGitConfig(repo);
    await cfg.setHooksPath('.githooks');
    expect(await cfg.getHooksPath()).toBe('.githooks');
  });

  it('setHooksPath overwrites a previous value', async () => {
    const cfg = new ChildProcessGitConfig(repo);
    await cfg.setHooksPath('.first');
    await cfg.setHooksPath('.second');
    expect(await cfg.getHooksPath()).toBe('.second');
  });

  it('round-trips a value with characters that need no quoting', async () => {
    const cfg = new ChildProcessGitConfig(repo);
    await cfg.setHooksPath('.my-hooks');
    expect(await cfg.getHooksPath()).toBe('.my-hooks');
  });
});
