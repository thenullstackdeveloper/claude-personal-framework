# 0005 — Report DTOs: CLI as the source of truth

- Status: accepted
- Date: 2026-06-14

## Context

The framework emits structured reports from three layers, each maintaining
its own copy of the same shape:

- **CLI** — `InstallCommandReport`, `StatusCommandReport`,
  `ListCommandReport`, etc. Hand-written TS types in
  `packages/cli/src/*.command.ts`. The CLI is the actual emitter:
  `claude-fw <command> --json` serializes one of these reports to stdout.
- **Rust** — `InstallReport`, `StatusReport`, `CatalogReport`, etc. Hand-
  written `#[derive(Serialize, Deserialize)]` structs in
  `apps/desktop/src-tauri/src/lib.rs`. Rust is a transit layer: each
  Tauri command spawns the CLI, reads the JSON envelope, and re-emits it
  to the frontend.
- **Desktop frontend** — `InstallReport`, `StatusReport`, etc. Hand-
  written types in `apps/desktop/src/lib/api.ts`. The desktop UI consumes
  these via `invoke<InstallReport>('install', …)`.

Every report field added in the last six months touched all three. The
audit flagged the triplication as "monitor, don't act" but the
`CLAUDEPERS-14` UI redesign alone added `catalogFolders`, `allowBuiltin`,
`gitConfigSkippedReason`, and a few smaller fields — each one bouncing
through three files. The cost of forgetting one is silent drift: a CLI
field that never reaches the UI, or the reverse.

## Options considered

### Option 1 — Status quo + checklist in CLAUDE.md

Document the triple-update requirement in CLAUDE.md as a process rule.

- ✅ Zero engineering cost.
- ❌ Process documentation has a poor track record against drift. The
  rule applies to a moving target (every new field) and the failure mode
  is silent — no test fails on omission.
- ❌ Doesn't shrink the surface; it adds a step to remember.

### Option 2 — Code generation from Rust with `ts-rs` or `specta`

Annotate every Rust struct with `#[derive(TS)]`; a build step emits TS
declarations consumed by the frontend.

- ✅ Eliminates the desktop copy. Frontend types come "for free" from
  Rust structs at build time.
- ❌ **Inverts the direction of the contract.** Rust isn't the source of
  truth here — the CLI is. Rust deserializes the JSON the CLI emitted
  and re-emits it. Generating TS from Rust means a new CLI field has to
  pass through Rust before the desktop can use it. That's an artificial
  serialization point in the dependency graph.
- ❌ Pipeline cost: `ts-rs` runs during `cargo test`, not `cargo build` —
  easy to forget. Tauri builds are already slow.
- ❌ Generics translate poorly. The discriminated unions used in
  `StatusSingleton` would round-trip through `serde_json::Value` or
  similar fallbacks.
- ❌ Doesn't actually deduplicate the CLI types — they would still need
  to be written by hand and kept in sync with the Rust generators.

### Option 3 — CLI exports `.d.ts`, desktop imports directly (chosen)

The CLI already emits declaration files (`tsc --emitDeclarationOnly` is
on). Adding a `./reports` entry point that re-exports the public report
types lets the desktop consume them via
`import type { InstallReport } from '@claude-fw/cli/reports';`. Rust
keeps its own structs (it has to: serde needs concrete types) but they
become a transit detail rather than a source of truth.

- ✅ Eliminates the desktop copy. Two of three layers converge.
- ✅ Preserves the direction of the contract: CLI is the emitter, so its
  types are the contract. Rust deserializes against it, desktop uses it.
- ✅ Zero pipeline cost — `tsc` already generates the `.d.ts` files; the
  monorepo's pnpm workspace already resolves cross-package imports.
- ✅ Reaches the desktop instantly: edit the CLI's report type, rebuild
  the CLI (`pnpm --filter @claude-fw/cli build`), the frontend
  typechecker picks it up on the next `tsc`.
- ❌ Rust still maintains hand-written structs. Mitigated by a contract
  test that deserializes a representative JSON fixture for each report
  — drift is caught at test time, not at runtime in front of a user.
- ❌ Frontend names had to be aliased (`ListCommandReport` →
  `CatalogReport`, `StatusCommandReport` → `StatusReport`, …) so the
  existing UI code didn't need a rename sweep. Acceptable trade-off; the
  CLI-side names better reflect "command output" while the frontend
  names better reflect "data shape".

## Decision

Option 3.

### Implementation

- `packages/cli/src/reports.ts` re-exports the public report types under
  the names the desktop UI uses (`InstallReport`, `StatusReport`, …).
- `packages/cli/package.json` declares an `exports` map with `.` and
  `./reports` entry points. Both expose types + JS so `import type` and
  `import` work.
- `apps/desktop/package.json` declares `@claude-fw/cli` as a workspace
  dependency.
- `apps/desktop/src/lib/api.ts` re-exports the types from
  `@claude-fw/cli/reports` and removes the local definitions. `CliError`
  and `PathDetection` stay local — they are Tauri-side concerns the CLI
  does not emit in this shape.
- Rust-side structs stay. A contract test in `apps/desktop/src-tauri/`
  asserts that a representative install-report JSON fixture deserializes
  into `InstallReport` end-to-end, so a CLI field added without the
  corresponding Rust update fails at test time.

### Why not (b)?

Two-thirds of the value of (b) is "no more hand-written Rust structs",
but Rust has to deserialize the CLI's JSON one way or another — the
serde struct is the natural way. Generating it from somewhere else would
mean either (i) re-publishing every field the CLI defines into a Rust
build artifact (extra mechanism, no extra safety beyond what serde
already provides) or (ii) running `serde_json::Value` through every
command and reaching into untyped maps in the Tauri layer (loses the
boundary). Neither is better than just maintaining the struct under a
contract test.

## Consequences

- A field added to a CLI report propagates to the desktop on the next
  TS build with no other change required. The Rust side will fail its
  contract test the next time it runs, prompting a one-line addition.
- The mental model becomes "CLI defines the shape; Rust mirrors it; the
  desktop reads it." Cleaner than the previous symmetric duplication.
- The `dist/` artifacts of `@claude-fw/cli` are now part of the public
  surface for `@claude-fw/desktop`. The desktop has to be rebuilt after a
  CLI rebuild for `tsc` to see the new declarations.
- Deferred 6 (generated/shared types across Rust ↔ TS ↔ CLI) is partially
  closed by this. The remaining open question is the Rust side; this
  ADR's contract-test approach is a stand-in until a real pain emerges
  there.
- If the CLI grows non-trivial generics or complex unions in its DTOs in
  the future, Specta becomes attractive again because at that point
  hand-rolling the Rust struct will be the bottleneck. Revisit at that
  point.
