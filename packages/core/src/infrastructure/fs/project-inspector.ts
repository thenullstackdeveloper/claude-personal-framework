import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectInspectorPort } from '../../application/ports/project-inspector.port.js';

const CLAUDE_DIR = '.claude';
const INSTRUCTIONS_FILENAME = 'CLAUDE.md';

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};

export class FsProjectInspector implements ProjectInspectorPort {
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
}
