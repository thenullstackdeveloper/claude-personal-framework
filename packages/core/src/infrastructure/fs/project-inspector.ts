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
}
