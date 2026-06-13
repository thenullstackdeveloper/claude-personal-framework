export { FsCatalogReader } from './fs-catalog-reader.js';
/**
 * @deprecated Use {@link FsCatalogReader}. This alias remains for back-compat
 * and will be removed in a future major version once consumers migrate to the
 * multi-source catalog model (see ADR-0004).
 */
export { FsCatalogReader as CatalogReader } from './fs-catalog-reader.js';
export { ClaudeWriter } from './claude-writer.js';
export { LockfileStore } from './lockfile-store.js';
export { FsManifestStore } from './manifest-store.js';
export { FsPathProbe } from './path-probe.js';
export { LocalProjectInspector } from './project-inspector.js';
