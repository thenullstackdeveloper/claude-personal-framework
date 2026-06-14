import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { StackInspectorPort } from '../../application/ports/stack-inspector.port.js';
import type { ProjectInspection } from '../../domain/model/project-inspection.js';
import { isErrnoException } from './fs-helpers.js';

const readDeps = (raw: unknown, field: string): readonly string[] => {
  if (typeof raw !== 'object' || raw === null) return [];
  const section = (raw as Record<string, unknown>)[field];
  if (typeof section !== 'object' || section === null) return [];
  return Object.keys(section as Record<string, unknown>);
};

/**
 * Reads the project root to populate a {@link ProjectInspection} for stack
 * detection.
 *
 * - Aggregates `dependencies` + `peerDependencies` from `package.json`,
 *   deduplicated. `devDependencies` are intentionally excluded — a testing
 *   library does not turn a repo into an app of that framework. See
 *   CLAUDEPERS-28.
 * - Lists top-level entry names (files and directories alike) in the root.
 *
 * On any read error (missing root, missing package.json, malformed JSON) the
 * affected slice falls back to an empty list and the inspection still
 * returns — `detectStack` must always run so the wizard can fall through to
 * "no match → user picks manually" instead of erroring out.
 */
export class FsStackInspector implements StackInspectorPort {
  async inspect(projectRoot: string): Promise<ProjectInspection> {
    const [dependencies, files] = await Promise.all([
      this.readDependencies(projectRoot),
      this.readFiles(projectRoot),
    ]);
    return { dependencies, files };
  }

  private async readDependencies(projectRoot: string): Promise<readonly string[]> {
    let raw: string;
    try {
      raw = await readFile(join(projectRoot, 'package.json'), 'utf-8');
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return [];
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed package.json — be lenient. The detection still runs, the
      // project just won't match any dependency-based rule.
      return [];
    }

    const deps = readDeps(parsed, 'dependencies');
    const peer = readDeps(parsed, 'peerDependencies');
    return Array.from(new Set([...deps, ...peer]));
  }

  private async readFiles(projectRoot: string): Promise<readonly string[]> {
    try {
      return await readdir(projectRoot);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return [];
      throw err;
    }
  }
}
