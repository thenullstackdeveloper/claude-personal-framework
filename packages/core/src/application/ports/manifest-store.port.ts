import type { ProjectManifest } from '../../domain/model/project-manifest.js';

/**
 * Reads and writes the project manifest (`.claude-fw.yaml` on disk —
 * the file that says which preset the project uses and which overrides
 * apply on top of it). The use cases work with `ProjectManifest`; the
 * adapter encapsulates the YAML format.
 */
export interface ManifestStorePort {
  /** Returns the current manifest, or `null` if no manifest exists. */
  read(): Promise<ProjectManifest | null>;

  /** Persists the manifest, replacing any existing one. */
  write(manifest: ProjectManifest): Promise<void>;
}
