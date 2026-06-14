import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PathKind, PathProbePort } from '../../application/ports/path-probe.port.js';
import { isErrnoException } from './fs-helpers.js';

export class FsPathProbe implements PathProbePort {
  async inspect(base: string, segment: string): Promise<PathKind> {
    try {
      const stats = await stat(join(base, segment));
      if (stats.isDirectory()) return 'directory';
      if (stats.isFile()) return 'file';
      return 'missing';
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return 'missing';
      throw err;
    }
  }
}
