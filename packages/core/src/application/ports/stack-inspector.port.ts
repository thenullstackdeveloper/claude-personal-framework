import type { ProjectInspection } from '../../domain/model/project-inspection.js';

/**
 * Reads the project root and returns a {@link ProjectInspection} for stack
 * detection. The port keeps the pure `evaluateDetects` rule free of I/O so
 * the matching policy and the inspection logic can evolve independently.
 *
 * Implementations decide how to populate the fields (parse `package.json`,
 * list top-level entries, etc.). When the project root does not exist or
 * cannot be read at all, implementations SHOULD return an empty inspection
 * (`{ dependencies: [], files: [] }`) rather than throwing — the wizard
 * needs to continue (`no match → user picks manually`), not abort.
 */
export interface StackInspectorPort {
  inspect(projectRoot: string): Promise<ProjectInspection>;
}
