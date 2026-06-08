import { spawn } from 'node:child_process';
import type { GitConfigPort } from '../../application/ports/git-config.port.js';

/**
 * `GitConfigPort` implementation backed by `git config` subprocesses.
 *
 * The repository is locked to the `cwd` passed at construction time.
 * `getHooksPath` returns `null` when the setting is unset (git exits
 * with code 1 and empty stdout in that case); otherwise it returns the
 * trimmed value. `setHooksPath` writes the value via
 * `git config core.hooksPath <path>`.
 */
export class ChildProcessGitConfig implements GitConfigPort {
  constructor(public readonly cwd: string) {}

  async getHooksPath(): Promise<string | null> {
    const { code, stdout } = await run(['config', '--get', 'core.hooksPath'], this.cwd);
    if (code === 1 && stdout.trim() === '') return null;
    if (code !== 0) {
      throw new Error(`git config --get core.hooksPath failed with exit code ${code}`);
    }
    return stdout.trim();
  }

  async setHooksPath(path: string): Promise<void> {
    const { code, stderr } = await run(['config', 'core.hooksPath', path], this.cwd);
    if (code !== 0) {
      throw new Error(`git config core.hooksPath ${path} failed (exit ${code}): ${stderr.trim()}`);
    }
  }
}

type SpawnResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

const run = (args: readonly string[], cwd: string): Promise<SpawnResult> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
