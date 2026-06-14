import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ManifestStorePort } from '../../application/ports/manifest-store.port.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';
import { parseProjectManifest } from '../yaml/parse-project-manifest.js';
import { serializeProjectManifest } from '../yaml/serialize-project-manifest.js';
import { isErrnoException } from './fs-helpers.js';

const MANIFEST_FILENAME = '.claude-fw.yaml';

/**
 * Filesystem adapter for the project manifest. The project root is
 * bound at construction time, mirroring `LockfileStore` and
 * `ClaudeWriter`. The adapter is the only place that knows the file
 * lives at `<root>/.claude-fw.yaml` and is encoded in YAML.
 */
export class FsManifestStore implements ManifestStorePort {
  constructor(public readonly projectRoot: string) {}

  private manifestPath(): string {
    return join(this.projectRoot, MANIFEST_FILENAME);
  }

  async read(): Promise<ProjectManifest | null> {
    try {
      const content = await readFile(this.manifestPath(), 'utf-8');
      return parseProjectManifest(content);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async write(manifest: ProjectManifest): Promise<void> {
    const content = serializeProjectManifest(manifest);
    await writeFile(this.manifestPath(), content, 'utf-8');
  }
}
