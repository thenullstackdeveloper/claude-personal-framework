# Roadmap

Prioritized backlog as of 2026-05-30. Update it when priorities shift
or items ship — a stale roadmap is worse than no roadmap.

Tiers reflect *when*, not *what*:

- **Now** — the next block of work. Already justified, no blockers.
- **Next** — comes after Now, no urgency on its own.
- **Deferred** — explicitly waiting on a named condition. Not
  "someday"; the condition is the trigger.

---

## Now

### 1 · Polish the desktop UI

Start by extracting `App.tsx` (~350 lines, four flows mixed) into
custom hooks: `useInstallFlow`, `useStatusFlow`, `useInitFlow`,
plus path/persistence wiring. Once the monolith is broken, iterate
UX and missing functionality as sub-items emerging from real usage —
not pre-imagined.

**Sub-phases of the refactor:**

- *0* — extract `buildConfirmMessage` helper (`1dc8767`). ✓
- *1* — extract `useDetectPath` hook (`639b68d`). ✓
- *2* — extract `useCatalogFlow` hook. Pending.
- *3* — extract `useStatusFlow` hook. Pending.
- *4* — extract `useInitFlow` hook. Pending.
- *5* — extract `useInstallFlow` hook (depends on 0 + 3). Pending.
- *6* — extract `usePathPicker` hook. Pending.
- *7* — `App.tsx` tidy as composition root (conditional, only if
  anything left to clean). Pending.

**UX sub-items surfaced during sub-phase 1 smoke tests** (each ships
as an independent commit):

- *1.UX.1* — **Tooltips on disabled buttons.** Today buttons go grey
  with no explanation of what's missing (catalog, preset, paths).
  Each disabled state needs a tooltip naming the gate.
- *1.UX.2* — **Disable Install when context is incomplete.** The
  Install button stays vibrant violet even with no project / no
  catalog / no manifest. Should grey out and trigger the tooltip
  from 1.UX.1.
- *1.UX.3* — **Clear stale status report on path change.** The
  Status panel keeps showing the previous project's drift report
  after the Project root field changes. Clear it on path change (or
  re-run check automatically — TBD).
- *1.UX.4* — **Fix preset dropdown styling.** The `<select>` inside
  the "Project not initialized" block renders white-on-white, making
  the selected preset invisible. Doesn't inherit the dark theme.
- *1.UX.5* — **Visible feedback on Load catalog re-press.** When the
  catalog is already loaded and the button is pressed again, only a
  microsecond flicker happens. Add a toast or visible pulse
  confirming the refresh — do not disable the button (re-loading is
  legitimate).

- *Why now:* the file size and lack of separation makes adding any
  UX or functionality friction. Refactoring first removes the
  blocker for everything that follows.
- *Cost:* medium. Refactor itself is bounded (~1 day) plus
  whatever UX work the next sub-items end up justifying.

### 2 · Presets for other personal stacks (React, React Native, Vue 3, Laravel)

With the catalog format finalized (settings + CLAUDE.md included) and
the catalog itself enriched (testing strategy skill, test-reviewer
agent, agnostic architect + TS rules skill, commit-style skill),
build first-class presets for each stack. Each preset needs at least
one or two stack-specific agents or skills to be more than an empty
`extends: base` shell.

- *Why now:* unblocked. Content work, not engine work. Likely first
  targets: react-native and nestjs presets enriched with their own
  testing-rules skills (see Deferred 9). Better tackled after the
  UI is polished so the install / status experience is solid when
  exercising new presets.
- *Cost:* medium per stack.

### 3 · Technical debt cleanup

Items the architecture audit flagged as "monitor, don't act":

- Report DTOs triplicated (CLI / Rust / frontend) — the surface grew
  meaningfully with Bloque 3 (`instructions`, `settings`,
  `StatusSingleton`, `CliError`). Consider a shared schema if it
  grows further. See Deferred 6.
- `parseSettings` duplicated between `parse-lockfile.ts` and
  `parse-preset.ts`.
- `isErrnoException` duplicated across four `infrastructure/fs/`
  adapters.
- CLI top-level error handler detects `--json` by re-scanning
  `process.argv` instead of using the parsed flag
  (`packages/cli/src/index.ts`). Heredado del Bloque 2; armonizar
  cuando se reescriba `main()`.

- *Why now:* all innocuous individually but they accumulate. Closing
  them clears the catalog before global bin install (Deferred 13)
  ships outwards.
- *Cost:* low each.

---

## Next

### 4 · Screenshots for the main README

Capture: empty state, catalog loaded with the Instructions card,
Initialize block on a fresh project, status with drift (including
the Settings/Instructions singleton rows), successful install
showing Settings + Instructions lines, take-over banner.

- *Why next, not now:* better captured **after** the UI polish of
  Now item 1 lands — otherwise the screenshots go stale immediately.
- *Cost:* low — you capture, the README edit is trivial.

---

## Deferred

Items waiting on a named condition. Each ships when its trigger
fires, not before. IDs are stable across the document's history so
commits referencing "Deferred N" keep meaning — item 8 was promoted
to Now on 2026-05-30 and intentionally left as a gap rather than
renumbered.

| Item | Trigger |
|---|---|
| 1 · `overrides:` field in Preset schema (ADR 0001 Option 4) | ≥ 2 work repos need to share the same override — duplicating it across project manifests becomes the pain that justifies the engine change. |
| 2 · Provider-agnostic `pr-creator` (ADR 0001 Option 3) | The framework is set up in a non-GitHub repo (Bitbucket / GitLab). |
| 3 · Sidecar bundling for the Tauri app | You need to distribute the desktop app to a third party. Dev mode is enough until then. |
| 4 · Refactor `jobs/` or `billing/` modules in Tubegist | You decide Tubegist itself needs the refactor. Calibration value alone has diminishing returns after the `users/` module. |
| 5 · Recorded demo or blog post | The roadmap is mostly green and you want a public artifact of the project. |
| 6 · Generated/shared types across Rust ↔ TS ↔ CLI (ts-rs / specta / CLI-published `.d.ts`) | A real drift bug bites (today: silent field drop), or a 3rd new command lands and the manual sync becomes the bottleneck. |
| 7 · Preview of `.claude/CLAUDE.md` and `.claude/settings.json` in the desktop UI | You want to inspect installed content without leaving the app. Requires `tauri-plugin-fs` and a viewer component. Likely emerges as a sub-item under Now 1 (UI polish) once the monolith is broken. |
| 8 · — | Promoted to Now item 1 on 2026-05-30. ID kept as a gap to preserve historical references in past commits. |
| 9 · Per-stack testing rules skills (`react-native-testing-rules`, `nestjs-testing-rules`, etc.) | You start auditing a project with `hexagonal-test-reviewer` and need stack-specific guidance (RNTL + native module mocks, supertest + TestContainers, etc.). Mirror the pattern of `nestjs-hexagonal-patterns`. |
| 10 · Calibrate `hexagonal-test-reviewer` agent | First live use of the agent on a real project surfaces gaps or false positives in the prompt. Same calibration cycle that closed the refactor agent. |
| 11 · Promote `commit-style` to the CLAUDE.md install flow | The skill exists but each project's CLAUDE.md still needs the "no AI attribution / never commit without OK" rules redundantly. When item 13 (global bin install) ships, evaluate if `claude-fw install` should also patch / append project CLAUDE.md from the catalog. |
| 12 · Surface frontmatter parse errors in `list`/`install` | A second catalog artifact silently ends up without description because of a YAML edge case (today: `: ` in plain scalar broke `hexagonal-test-reviewer` — commit `1f0ad0a`). Today `extractFrontmatterDescription` swallows parse errors and returns `''`, which is defensive but hard to diagnose. When it bites again, change the contract to emit a warning to stderr (or fail loudly in `--json`) when frontmatter exists but description is empty / unparseable. |
| 13 · Global bin install for the CLI | Now items 1, 2 and 3 closed. Ship `claude-fw` as a globally invokable command (`pnpm i -g` from the repo, or publishing to a scoped registry). Deferred because installing it globally before the UI is polished, the catalog has more stacks, and the engine debt is cleared exports an unfinished feel to anyone who tries it from outside. ≈ 1 h once unblocked. |

---

## Recently shipped

- **Settings (with hooks) + per-stack `CLAUDE.md` as catalog artifacts** — closed across three commits:
  - `29bc33a` engine: `Settings` wraps `Permissions + Hooks`; lockfile + drift carry settings hash.
  - `fed6857` engine: `Instructions` VO singleton concatenated from `instructions/<id>.md`; `.claude/CLAUDE.md` materialization; take-over guard via `UnmanagedClaudeMdError`.
  - `ea579e0` desktop: Instructions card, Settings/Instructions singleton drift in status, take-over UI with Retry, structured `CliError`, vitest + RTL baseline.

- **Catalog calibration from Tubegist refactor sweep** — Item 2 of Now (Calibrate `hexagonal-refactor-nestjs`) closed plus three related upgrades that grew naturally from the sweep:
  - `944388d` skill: `commit-style` documenting message conventions (rule zero "no AI attribution", Conventional Commits with type table, four named body patterns, HEREDOC for multi-line, `--no-ff` merges). Added to `base` preset.
  - `595cf54` agent: `hexagonal-refactor-nestjs` rewritten (148 → 239 lines) folding the 8 lessons accumulated from queue/me/worker/auth/llm refactors: Phase 1 cross-module sweep + comment scan + repo precedents, Phase 2 explicit verdict A–E, "Cuándo NO proponer port abstraction" block, "Comentarios — stale vs explica-coupling" block, "Mappers con omisiones deliberadas" block, rule zero on invariants vs folders.
  - `99da5da` architect decoupled: `hexagonal-architect` agent now language/framework agnostic (66 → 105 lines folding the same 6 lessons that applied to it). TypeScript-specific rules extracted to new `typescript-hexagonal-rules` skill — mirrors the `nestjs-hexagonal-patterns` pattern.
  - `616e510` testing: new agnostic skill `hexagonal-testing-strategy` (pyramid per layer with what/how/volume, fakes >> mocks policy, mappers with omissions, anti-patterns, qualitative health signals) and new `hexagonal-test-reviewer` agent (dual-mode audit/design, one module per session, ad-hoc invocation only — stays out of base preset by design).

---

## Index of related decisions

- [`docs/adr/0001-pr-creator-provider-coupling.md`](adr/0001-pr-creator-provider-coupling.md) — gates two Deferred items (overrides in preset, provider-agnostic `pr-creator`).
- [`docs/adr/0002-node-crypto-in-domain.md`](adr/0002-node-crypto-in-domain.md) — accepted trade-off, no roadmap impact.
