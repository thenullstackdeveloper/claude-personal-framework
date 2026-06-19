import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GitignoreApplyResult,
  GitignorePort,
} from '../../application/ports/gitignore.port.js';
import { computeGitignoreBlock } from '../../domain/services/gitignore-block.js';
import { isErrnoException } from './fs-helpers.js';

const GITIGNORE_FILENAME = '.gitignore';

/**
 * Filesystem adapter for {@link GitignorePort}. Owns only the I/O —
 * the byte-level decision of what content to write lives in the pure
 * domain transform {@link computeGitignoreBlock}.
 *
 * Symlinks: if `.gitignore` is a symlink, we operate on its real path.
 * That way a project that keeps its gitignore inside a config directory
 * and symlinks it back to the root sees the managed block land where
 * the user expects it.
 *
 * Atomicity: a non-trivial change writes to a `.gitignore.tmp` sibling
 * and renames into place. Same-directory rename is atomic on every
 * POSIX filesystem we ship to, so a crash mid-write never leaves a
 * truncated gitignore.
 */
export class FsGitignore implements GitignorePort {
  constructor(public readonly projectRoot: string) {}

  async ensureManagedBlock(entries: readonly string[]): Promise<GitignoreApplyResult> {
    const path = await this.resolvePath();
    const existing = await this.readExisting(path);
    const { nextContent, status } = computeGitignoreBlock(existing, entries);

    if (status === 'unchanged' || status === 'block-conflict') {
      return { status, path };
    }

    const tmpPath = `${path}.tmp`;
    await writeFile(tmpPath, nextContent, 'utf-8');
    await rename(tmpPath, path);

    return { status, path };
  }

  private async resolvePath(): Promise<string> {
    const candidate = join(this.projectRoot, GITIGNORE_FILENAME);
    try {
      return await realpath(candidate);
    } catch (err) {
      // The file doesn't exist yet — fall back to the canonical location
      // so the writer can create it.
      if (isErrnoException(err) && err.code === 'ENOENT') return candidate;
      throw err;
    }
  }

  private async readExisting(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf-8');
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return null;
      throw err;
    }
  }
}
