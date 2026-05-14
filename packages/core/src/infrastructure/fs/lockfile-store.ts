import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LockfileStorePort } from '../../application/ports/lockfile-store.port.js';
import type { Lockfile } from '../../domain/model/lockfile.js';
import { parseLockfile, serializeLockfile } from '../json/parse-lockfile.js';

const LOCKFILE_FILENAME = '.claude-fw.lock.json';

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};

export class LockfileStore implements LockfileStorePort {
  constructor(public readonly projectRoot: string) {}

  private path(): string {
    return join(this.projectRoot, LOCKFILE_FILENAME);
  }

  async read(): Promise<Lockfile | null> {
    let content: string;
    try {
      content = await readFile(this.path(), 'utf-8');
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return null;
      throw err;
    }
    return parseLockfile(content);
  }

  async write(lockfile: Lockfile): Promise<void> {
    await writeFile(this.path(), serializeLockfile(lockfile), 'utf-8');
  }
}
