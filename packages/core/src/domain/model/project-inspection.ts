/**
 * Snapshot of what the project root looks like, from the perspective of
 * stack detection.
 *
 * Filled by a `StackInspectorPort` adapter (infra) and consumed by the
 * pure `evaluateDetects` rule (domain). The split lets the matching rule
 * stay free of I/O while the inspection itself can be tested separately.
 *
 * - `dependencies`: union of `dependencies` + `peerDependencies` from the
 *   project's `package.json`. Empty when no package.json exists, when the
 *   file cannot be parsed, or when neither section is present. Package
 *   names appear once even if listed in both sections.
 * - `files`: top-level entry names in the project root (files and
 *   directories alike, without trailing slashes).
 */
export type ProjectInspection = {
  readonly dependencies: readonly string[];
  readonly files: readonly string[];
};
