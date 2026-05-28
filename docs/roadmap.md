# Roadmap

Prioritized backlog as of 2026-05-28. Update it when priorities shift
or items ship — a stale roadmap is worse than no roadmap.

Tiers reflect *when*, not *what*:

- **Now** — the next block of work. Already justified, no blockers.
- **Next** — comes after Now, no urgency on its own.
- **Deferred** — explicitly waiting on a named condition. Not
  "someday"; the condition is the trigger.

---

## Now

### 1 · Global bin install for the CLI

Ship `claude-fw` as a globally invokable command instead of
`node packages/cli/dist/index.js`. Options on the table: `pnpm i -g`
from the repo, or publishing to a scoped registry.

- *Why now:* quick win. Improves daily use and the demo path.
  Independent.
- *Cost:* low (≈ 1 h).

### 2 · Calibrate the `hexagonal-refactor-nestjs` agent

Fold the lessons from the `users/` refactor in Tubegist into the
agent's prompt:

- YAGNI — never create empty files or unused methods "just in case".
- Never emit empty commits to satisfy a plan.
- If splitting two commits would break the "tests green between
  commits" invariant, fuse them and document the reason in the body.

- *Why now:* cheap (one markdown edit) and **must precede** any
  further refactor in Tubegist (Deferred item 4). Otherwise the next
  refactor repeats the same mistakes.
- *Cost:* low (≈ 30 min).

---

## Next

### 3 · Presets for other personal stacks (React, React Native, Vue 3, Laravel)

With the catalog format finalized (settings + CLAUDE.md included),
build first-class presets for each stack. Each preset needs at least
one or two stack-specific agents or skills to be more than an empty
`extends: base` shell.

- *Why next:* unblocked now that the catalog format is closed.
  Content work, not engine work — schedule when the rest of Now is
  cleared.
- *Cost:* medium per stack.

### 4 · Technical debt cleanup

Items the architecture audit flagged as "monitor, don't act":

- Report DTOs triplicated (CLI / Rust / frontend) — the surface grew
  meaningfully with Bloque 3 (`instructions`, `settings`,
  `StatusSingleton`, `CliError`). Consider a shared schema if it
  grows further. See Deferred 6.
- `parseSettings` duplicated between `parse-lockfile.ts` and
  `parse-preset.ts`.
- `isErrnoException` duplicated across three (now four with
  `project-inspector.ts`) `infrastructure/fs/` adapters.
- CLI top-level error handler detects `--json` by re-scanning
  `process.argv` instead of using the parsed flag (`packages/cli/src/index.ts`).
  Heredado del Bloque 2; armonizar cuando se reescriba `main()`.

- *Why "next" and not "now":* all innocuous today. Fold them in as
  cleanup when touching the surrounding code; they don't deserve a
  phase of their own.
- *Cost:* low each.

### 5 · Screenshots for the main README

Capture: empty state, catalog loaded with the Instructions card,
Initialize block on a fresh project, status with drift (including
the Settings/Instructions singleton rows), successful install
showing Settings + Instructions lines, take-over banner.

- *Why now possible:* the UI shape settled after Bloque 3.
- *Cost:* low — you capture, the README edit is trivial.

---

## Deferred

Items waiting on a named condition. Each ships when its trigger
fires, not before.

| Item | Trigger |
|---|---|
| 1 · `overrides:` field in Preset schema (ADR 0001 Option 4) | ≥ 2 work repos need to share the same override — duplicating it across project manifests becomes the pain that justifies the engine change. |
| 2 · Provider-agnostic `pr-creator` (ADR 0001 Option 3) | The framework is set up in a non-GitHub repo (Bitbucket / GitLab). |
| 3 · Sidecar bundling for the Tauri app | You need to distribute the desktop app to a third party. Dev mode is enough until then. |
| 4 · Refactor `jobs/` or `billing/` modules in Tubegist | You decide Tubegist itself needs the refactor. Calibration value alone has diminishing returns after the `users/` module. |
| 5 · Recorded demo or blog post | The roadmap is mostly green and you want a public artifact of the project. |
| 6 · Generated/shared types across Rust ↔ TS ↔ CLI (ts-rs / specta / CLI-published `.d.ts`) | A real drift bug bites (today: silent field drop), or a 3rd new command lands and the manual sync becomes the bottleneck. |
| 7 · Preview of `.claude/CLAUDE.md` and `.claude/settings.json` in the desktop UI | You want to inspect installed content without leaving the app. Requires `tauri-plugin-fs` and a viewer component. |
| 8 · Refactor `App.tsx` into custom hooks (`useInstallFlow`, `useStatusFlow`, `useInitFlow`) | A fourth flow is added or integration tests on `App.tsx` become painful to write. Today the file is ~350 lines and readable. |

---

## Recently shipped

- **Settings (with hooks) + per-stack `CLAUDE.md` as catalog artifacts** — closed across three commits:
  - `29bc33a` engine: `Settings` wraps `Permissions + Hooks`; lockfile + drift carry settings hash.
  - `fed6857` engine: `Instructions` VO singleton concatenated from `instructions/<id>.md`; `.claude/CLAUDE.md` materialization; take-over guard via `UnmanagedClaudeMdError`.
  - `ea579e0` desktop: Instructions card, Settings/Instructions singleton drift in status, take-over UI with Retry, structured `CliError`, vitest + RTL baseline.

---

## Index of related decisions

- [`docs/adr/0001-pr-creator-provider-coupling.md`](adr/0001-pr-creator-provider-coupling.md) — gates two Deferred items (overrides in preset, provider-agnostic `pr-creator`).
- [`docs/adr/0002-node-crypto-in-domain.md`](adr/0002-node-crypto-in-domain.md) — accepted trade-off, no roadmap impact.
