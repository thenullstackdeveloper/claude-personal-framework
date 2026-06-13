import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectInspectorPort } from '../../application/ports/project-inspector.port.js';
import type { HookName } from '../../domain/model/identifiers.js';

const CLAUDE_DIR = '.claude';
const INSTRUCTIONS_FILENAME = 'CLAUDE.md';
const GITHOOKS_DIR = '.githooks';

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};

export class LocalProjectInspector implements ProjectInspectorPort {
  constructor(public readonly projectRoot: string) {}

  async claudeMdExists(): Promise<boolean> {
    try {
      await access(join(this.projectRoot, CLAUDE_DIR, INSTRUCTIONS_FILENAME));
      return true;
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async gitHookExists(hookName: HookName): Promise<boolean> {
    try {
      await access(join(this.projectRoot, GITHOOKS_DIR, hookName));
      return true;
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async isGitRepo(): Promise<boolean> {
    const { code, stdout } = await runGit(['rev-parse', '--is-inside-work-tree'], this.projectRoot);
    // Canonical positive answer is exit 0 + stdout "true". Any other
    // outcome (exit 128 for "not a git repository", "false" for the
    // .git dir itself, etc.) is treated as "not a working tree".
    return code === 0 && stdout.trim() === 'true';
  }
}

type GitResult = { readonly code: number; readonly stdout: string };

const runGit = (args: readonly string[], cwd: string): Promise<GitResult> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    // stderr is discarded — we only need the canonical exit-code + stdout
    // answer; failure modes collapse into "not a repo".
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
