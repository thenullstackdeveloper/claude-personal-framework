/**
 * A single matching rule inside a Preset's `detects:` array.
 *
 * All fields present in the rule must be satisfied for the rule to match
 * (AND semantics inside a rule). Multiple rules within the same Preset are
 * evaluated as OR (see {@link evaluateDetects} in domain/services).
 *
 * - `dependencies`: package names that must appear in the union of
 *   `dependencies` + `peerDependencies` from `package.json`. devDependencies
 *   are intentionally excluded — a testing library does not turn a repo into
 *   an app of that framework. See CLAUDEPERS-28.
 * - `files`: top-level entries that must exist in the project root. Trailing
 *   slashes are tolerated so YAML can document "this is a directory".
 *
 * A rule with NO fields (or empty arrays for all of them) never matches.
 * A preset that wants to act as a fallback omits the `detects:` block
 * entirely — empty rules are not the same as no rules.
 */
export type DetectRule = {
  readonly dependencies?: readonly string[];
  readonly files?: readonly string[];
};
