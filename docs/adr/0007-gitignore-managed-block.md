# 0007 — Gitignore: managed block in target projects

- Status: accepted
- Date: 2026-06-19

## Context

`install` materializes outputs into the target project: agents, skills,
commands under `.claude/`, git hooks under `.githooks/`, optionally
`.claude/settings.json` and `.claude/CLAUDE.md`. Until this ADR the
engine wrote those files but never touched the project's `.gitignore`.

The result is the bug that surfaced right after CLAUDEPERS-50: a fresh
install on `~/Projects/my-budget` left 4 untracked critical paths
(`.claude/`, `.githooks/`, `.claude-fw.yaml`, `.claude-fw.lock.json`)
that a stray `git add .` would commit into the user's project repo —
output bytes treated as source-of-truth source.

The framework's own repo only escaped because the gitignore lines had
been added by hand in commit `a74e2ba` while closing
CLAUDEPERS-50/N.F. That doesn't scale to every project the user wants
to host the framework in.

The pattern is well-known: rustup, nvm, direnv, Husky, ESLint all
maintain a markers-delimited "managed block" in `.gitignore` (or
similar files) so the tool can update it idempotently without
clobbering user edits outside the block.

## What ships from this ADR

- A pure domain transform `computeGitignoreBlock` that takes
  `(existingContent | null, entries)` and returns
  `{ nextContent, status }` with status in `unchanged | created |
  updated | block-conflict`.
- A new application port `GitignorePort` (read-modify-write semantics
  are distinct from `WriterPort`'s pure writes — they earn their own
  port).
- An adapter `FsGitignore` that handles I/O — read, symlink resolution
  via `realpath`, atomic write via `.gitignore.tmp` + `rename`.
- The constant `INSTALL_OUTPUT_GITIGNORE_ENTRIES` co-located with
  `install` (application concern, not a domain invariant — if the
  writer ever materializes at a new path, the list updates alongside
  it).
- `init` and `install` use cases both call the port when provided.
- The report DTOs (`InitReport`, `InstallReport`) carry a `gitignore`
  field with `{ status, path } | null`; CLI human summary, Rust
  contract tests, and desktop UI all render it.

## Decisions and alternatives considered

### D1 · Where to seed/update — verdict (c) **Both**

`init` seeds the file when a project is configured for the first time
(creating `.gitignore` from scratch if needed). `install` re-asserts
on every run.

Considered:

- (a) `init` only — the first hand-edit of the gitignore would be
  silently ignored forever, and clones / collaborators never see a
  fresh assertion. Too fragile.
- (b) `install` only — every collaborator's first `install` would
  silently mutate a tracked file they didn't ask the framework to
  touch. Too aggressive for a first-contact UX.
- (c) **Both** — `init` is the explicit "configure this project to
  host claude-fw" moment, install is the cheap re-assertion. The cost
  of re-asserting is one read + diff per install, trivial.
- (d) A new `gitignore` CLI command — too much surface for plumbing.

### D2 · Marker style — verdict (a) **Block delimited by sentinel comments**

```
# >>> claude-fw managed (do not edit) >>>
.claude/agents/
.claude/skills/
.claude/commands/
.claude/settings.json
.claude/CLAUDE.md
.githooks/
# <<< claude-fw managed <<<
```

Considered:

- (a) **Markers** — only honest way to support idempotence and future
  block evolution. The comment line itself names the contract ("do
  not edit"). Pattern used by rustup / nvm / direnv / Husky.
- (b) Plain lines, no markers — there's no robust way to tell "this
  line was ours" from "the user added the same line". Any later
  update would either duplicate or refuse to act on slightly-edited
  variants. Rejected.

### D3 · Idempotence — verdict (b) **Markers-aware replace, with byte-identical short-circuit**

- No markers found → append fresh block with a leading blank line
  (or no separator if the file is empty).
- Markers found, contents byte-identical to target → return
  `unchanged` and the original content verbatim (no write, no mtime
  change).
- Markers found, contents differ → replace block contents while
  preserving lines before and after.
- Two pairs of markers found → return `block-conflict`, do not write.

User edits inside the managed block are subject to the documented
contract ("do not edit between these markers"). Replace mode wipes
them on next install — same as rustup, nvm, etc.

Considered:

- (a) Append-only — cannot evolve the block over time. Rejected.
- (b) **Markers-aware replace + verbatim short-circuit** — chosen.
- (c) Diff-aware subset — complex with no clear win over (b).

### D4 · Missing `.gitignore` — verdict (a) **Create it**

If the file does not exist, `init` creates it containing only our
managed block + trailing newline. The user gets a useful file with
clear ownership.

Considered:

- (a) **Create** — the bug we are fixing IS "install output uncovered
  on fresh projects". Skipping creation leaves the bug present in
  that exact case. Chosen.
- (b) Skip — would preserve "no surprise file creation" at the cost
  of leaving the bug live.

### D5 · `init` vs `install` on conflict

- `init` throws `GitignoreBlockConflictError`. We don't want to
  advertise a successful init while leaving the gitignore in an
  unrecoverable state. The manifest is written BEFORE the gitignore
  call (so a conflict still leaves a usable manifest the user can
  install from after a manual cleanup).
- `install` does NOT throw on conflict. Materialization is the
  user-facing value of the install command; a corrupted gitignore
  shouldn't block work that has nothing to do with it. Instead the
  status is surfaced in the report and the CLI / desktop render a
  warning chip.

## Consequences

- `.claude-fw.yaml` (manifest) and `.claude-fw.lock.json` (lockfile)
  stay **tracked** — they are project sources of truth, equivalent to
  `package.json` and `package-lock.json`.
- The marker contract is stable: future entries can be added without a
  new ADR. Changing the marker text would require a new ADR + a
  migration step.
- Per-subdir `.gitignore` (e.g., `.claude/.gitignore` instead of
  root) is explicitly **out of scope**. Reopen if a real project ever
  needs it.
- CRLF on Windows-edited gitignores is normalized to LF on every
  pass; the file is POSIX-canonical regardless of the host platform
  (`.gitignore` is POSIX-defined in git regardless of host).
- Symlinked `.gitignore` is followed via `realpath`, so projects that
  keep their gitignore in a shared config dir and link it back to the
  root see the managed block land on the real file.

## Pointers

- Domain transform: `packages/core/src/domain/services/gitignore-block.ts`
- Port: `packages/core/src/application/ports/gitignore.port.ts`
- Adapter: `packages/core/src/infrastructure/fs/fs-gitignore.ts`
- Wiring in install: `packages/core/src/application/use-cases/install/install.use-case.ts`
- Wiring in init: `packages/core/src/application/use-cases/init-project/init-project.use-case.ts`
- Block conflict error: `packages/core/src/application/use-cases/init-project/errors.ts`
- CLI rendering: `packages/cli/src/install.command.ts`, `packages/cli/src/init.command.ts`
- Rust contract: `apps/desktop/src-tauri/src/lib.rs` (`GitignoreApplyResult` + `contract_tests::install_report_deserializes*`, `contract_tests::init_report_deserializes`)
- Plane umbrella: `CLAUDEPERS-55`
