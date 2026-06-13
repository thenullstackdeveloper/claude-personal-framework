# Catalog detection — the `detects:` policy

The welcome wizard (CLAUDEPERS-19) preselects a preset by matching the
project root against rules declared inside the preset YAML. This page
documents how the matching works, why it works that way, and how to
write a `detects:` block.

For the architectural decisions behind the catalog itself, see
[ADR-0003 (multi-source catalog migration)](adr/0003-multi-source-catalog-migration.md)
and [ADR-0004 (catalog sources as a composition concern)](adr/0004-catalog-sources-as-composition-concern.md).

## Shape

A preset declares an optional `detects:` block:

```yaml
# presets/tauri-rust-react.yaml
detects:
  - dependencies: [react]
    files: [src-tauri/]
```

Each item in the array is a **rule**. A rule is satisfied when *all*
of its fields match the project — fields inside a rule are AND.
A preset's `detects:` matches if *any* of its rules is satisfied —
rules across the array are OR.

A preset that intentionally omits `detects:` is treated as a
**fallback**: the wizard never preselects it. `base.yaml` is the
canonical example.

## What gets inspected

The engine reads two things from the project root before evaluating
rules:

| Field            | Source                                                                |
|------------------|-----------------------------------------------------------------------|
| `dependencies`   | The union of `dependencies` + `peerDependencies` from `package.json`. |
| `files`          | The top-level entry names in the project root (files and directories alike, without trailing slashes). |

Both fields are populated by `FsStackInspector`. Missing inputs (no
`package.json`, malformed JSON, no read access to the root) fall
through to empty lists rather than throwing — the wizard always runs,
and a project with no signals simply has no match.

## Dependency matching — `dependencies + peerDependencies` only

The engine matches against `dependencies` and `peerDependencies`.
It **does not** match against:

- `devDependencies`
- `optionalDependencies`
- `bundledDependencies`
- Any other root field

The reason is direct and load-bearing: **a testing library does not
turn a repo into an app of that framework**. If `package.json` lists
`react` only because some test helper pulled it in, the project is not
"a React app" and the wizard should not propose the React preset. The
rule is intentionally conservative: false positives in the wizard cost
the user a wrong setup; false negatives cost them one extra click in
the dropdown.

This decision was tracked as `CLAUDEPERS-28`. The full acceptance test
matrix lives in
`packages/core/src/infrastructure/fs/fs-stack-inspector.test.ts`:

- `dependencies` → matches.
- `peerDependencies` → matches.
- `devDependencies` → does **not** match.
- `optionalDependencies` and friends → do **not** match.
- Both `dependencies` and `peerDependencies` listing the same package
  → counted once.

If you find yourself wanting a `devDependencies` match in the future,
that is the signal to revisit this doc rather than to quietly relax
the policy.

## File matching

Each entry in `files:` is a project-root entry name. The match is
substring-exact against the names returned by `readdir(projectRoot)`.

A trailing slash is tolerated so YAML can convey "this is a directory":

```yaml
detects:
  - files: [src-tauri/]
```

…matches a project that contains a directory named `src-tauri` at its
root. There is no recursive descent: only top-level entries are
inspected. Monorepos with apps nested under `apps/*` need to run
`detect-stack` against the specific app path, not the monorepo root —
that constraint mirrors how the engine treats the project root in
every other use case (`install`, `status`, …).

## Specificity and ranking

When several presets in the catalog match the same project, the
wizard ranks them by **specificity**: the number of patterns matched
in the winning rule of the preset. More patterns matched ⇒ a more
specific match ⇒ higher rank.

```yaml
# react-app.yaml
detects:
  - dependencies: [react]
# specificity: 1 if the project has react in dependencies

# tauri-rust-react.yaml
detects:
  - dependencies: [react]
    files: [src-tauri/]
# specificity: 2 if both match
```

For a project with `react` + `src-tauri/`, `tauri-rust-react` ranks
above `react-app`. The wizard preselects the first.

On ties (two presets with the same specificity), the wizard does
**not** preselect — it forces the user to pick consciously. This
mirrors the decision-on-ties rule cleared in the original UX debate.

## Writing a `detects:` block

Practical guidelines:

- **Make rules specific enough to distinguish your stack.** A single
  `dependencies: [react]` rule matches every React project, including
  ones that are not the stack your preset targets. Combine with
  `files:` whenever a stack has a recognizable directory or config
  file (`src-tauri/`, `app/`, `nest-cli.json`).
- **Use the namespaced package name** when the framework has one
  (e.g. `@nestjs/core`, not just `nest`). Easier to reason about,
  zero chance of accidental match.
- **Add a comment above the block** explaining the rationale in one
  line. Future-you will thank present-you the first time a preset
  matches something it shouldn't.
- **No detects block** is the right answer for fallback presets
  (`base`, generic templates). Do not add an empty `detects: []` —
  that is the same as no rules, but noisier.

## Where to look in the code

| Concern                                        | File                                                                                  |
|------------------------------------------------|---------------------------------------------------------------------------------------|
| Rule shape                                     | `packages/core/src/domain/model/detect-rule.ts`                                       |
| Project inspection shape                       | `packages/core/src/domain/model/project-inspection.ts`                                |
| Matching policy (pure)                         | `packages/core/src/domain/services/evaluate-detects.ts`                               |
| `package.json` + filesystem inspection         | `packages/core/src/infrastructure/fs/fs-stack-inspector.ts`                           |
| Use case (catalog × inspection → ranking)      | `packages/core/src/application/use-cases/detect-stack/detect-stack.use-case.ts`       |
| CLI entry point                                | `packages/cli/src/detect-stack.command.ts` (`claude-fw detect-stack --project <path>`)|
| Tauri command                                  | `apps/desktop/src-tauri/src/lib.rs` (`detect_stack`)                                  |
