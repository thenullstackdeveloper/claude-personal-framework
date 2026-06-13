# 0003 — Multi-source catalog migration

- Status: accepted
- Date: 2026-06-13

## Context

Until the work in the `CLAUDEPERS-14` umbrella started, every command
in the engine took a single `frameworkRoot` path: one folder, one
catalog. The desktop and the CLI both surfaced it as a field the user
had to fill in by hand — and a missing or wrong path was the most
common cause of "nothing works yet" support friction.

Three forces emerged in the UX debate that closed on 2026-06-13:

1. **The catalog should travel with the app** (decision P2 / B1).
   A user installing the desktop should not need to clone the framework
   repo and remember a path; the catalog rides in the binary.
2. **The user must be able to add their own presets** (decision B2).
   Personal skills live outside the public catalog. The UI exposes a
   list of user folders in Settings.
3. **Developers of this very framework need fast iteration** (decision
   B3). When Angel edits an agent in this repo, the app should pick
   the change up immediately — without rebuilding the binary.

These three forces together require **more than one catalog source at
the same time**, with a deterministic order: the env override beats
user folders, which beat the built-in.

The previous single-`frameworkRoot` model could not represent that.
Either it changes, or those features stay impossible to ship together.

## Options considered

### Option 1 — Hard break: drop `--framework` entirely, force migration

`--framework` is removed in the same release that introduces
`--catalog-folder`. Every script, every CI pipeline, every memory of
how to run the CLI breaks at once.

- ✅ Single source of truth in the help text. Nothing to explain twice.
- ❌ Every existing user script breaks on upgrade, with no
  back-compat window. Aggressive for a tool that runs in user
  pipelines.
- ❌ Cuts the migration off before it has been validated in the wild
  — if the new flag has rough edges, there is no fallback.

### Option 2 — Two-source model: built-in + one user override

`--framework` stays, points at one user folder; built-in is added.
No precedence chain, no aggregation.

- ✅ Simplest possible step away from the old shape.
- ❌ Closes the door on `CFW_CATALOG_PATH` (B3) and multiple user
  folders (B2). Either we ship those forces unsatisfied, or we revisit
  the catalog layer again in the next bloque.
- ❌ Re-opens the design conversation in three months instead of
  closing it now.

### Option 3 — Gradual migration with three sources and explicit precedence (chosen)

`--catalog-folder <path>` (repeatable), `--no-builtin`, and the
`CFW_CATALOG_PATH` env var land together with the built-in source.
`--framework` is preserved as a back-compat translation to a single
folder source and is marked deprecated in `--help`.

The precedence resolved at the composition root is:

```
$CFW_CATALOG_PATH   >   --catalog-folder (in order of appearance)   >   --framework (legacy)   >   built-in
```

On collisions by id, the higher-precedence source wins (first-wins
dedup) — see the implementation in `AggregatedCatalog`.

- ✅ Every existing script keeps working after upgrade. Migration is
  voluntary, with `--help` nudging users toward the new flag.
- ✅ Lets us validate the new flag in the wild before deciding when
  exactly to retire the old one.
- ✅ All three forces (built-in, user folders, env override) are
  satisfied in one bloque.
- ❌ Two ways of saying the same thing for the deprecation window.
  Mitigated by a single help section that points at `--catalog-folder`.
- ❌ Composition root needs to teach itself the precedence rules; the
  CLI grows a small helper (`buildCatalogPort`).

## Decision

Option 3.

`--framework` stays functional and is marked `[deprecated]` in the
`--help` output. Internally it is translated to a single folder source
at the same precedence step as the legacy behaviour. The new flags
(`--catalog-folder`, `--no-builtin`) and the env var
(`CFW_CATALOG_PATH`) are first-class citizens of the new model.

The deprecation window stays open until the next major release of the
CLI. The trigger for retirement is "no internal consumer uses
`--framework` anymore and external usage has moved to
`--catalog-folder`". When that holds, a follow-up ADR will close this
one.

The precedence and merge policy live in `AggregatedCatalog`
(application service), not in any adapter. The shape of "what counts
as a source" lives only at the CLI composition root — see ADR-0004 for
why that distinction matters.

## Consequences

- The CLI gains `--catalog-folder` (repeatable), `--no-builtin`, and a
  helper `buildCatalogPort({ frameworkFlag, catalogFolders, env,
  allowBuiltin })` that returns a single `CatalogPort` — possibly an
  `AggregatedCatalog` over many sources.
- The desktop ships the catalog embedded in the binary
  (`CLAUDEPERS-25`) and exposes both "Add folder" and a `--no-builtin`
  toggle in Settings (`CLAUDEPERS-22`).
- New error code `NO_CATALOG_SOURCE` covers the case where nothing has
  been configured — previously a plain `Error`. The CLI JSON envelope
  carries the typed code so the desktop can react gracefully.
- The `frameworkRoot` field in the existing desktop UI loses its
  load-time requirement: the catalog button works without it because
  the built-in is always there (`CLAUDEPERS-25`). Install and Status
  still gate on a known framework root until the UI redesign in
  `CLAUDEPERS-20`.
- The `CLAUDE_FW_ROOT` env var keeps working as a fallback when no
  `--framework` is given, mirroring previous behaviour — the new env
  var is a separate name (`CFW_CATALOG_PATH`) with different semantics
  (highest precedence rather than fallback).
- Tests and documentation pay a small cost: every command-level test
  that previously took `frameworkRoot: path` now takes
  `catalog: new FsCatalogReader(path)` instead. The change is local
  and was applied in one commit (`feat(core,cli): multi-source catalog
  with precedence`).
