# Roadmap

Prioritized backlog as of 2026-06-14. Update it when priorities shift
or items ship — a stale roadmap is worse than no roadmap.

Tiers reflect *when*, not *what*:

- **Now** — the next block of work. Already justified, no blockers.
- **Next** — comes after Now, no urgency on its own.
- **Deferred** — explicitly waiting on a named condition. Not
  "someday"; the condition is the trigger.

---

## Now

### 1 · Consolidation post-`CLAUDEPERS-14`

Small consolidation block after the UI redesign. Three threads, all
low-risk, plus the screenshot capture that was previously in Next but
makes sense to fold in now while the new UI is fresh.

**Tech debt cleanup** (audit-flagged "monitor, don't act" items that
have accumulated):

- Report DTOs triplicated across CLI / Rust / frontend — the surface
  grew meaningfully with Settings + Instructions + git hooks + the
  new catalog source flags. Consider a shared schema if it grows
  further. See Deferred 6.
- `parseSettings` duplicated between `parse-lockfile.ts` and
  `parse-preset.ts`.
- `isErrnoException` duplicated across four `infrastructure/fs/`
  adapters.
- CLI top-level error handler detects `--json` by re-scanning
  `process.argv` instead of using the parsed flag
  (`packages/cli/src/index.ts`). Inherited from Bloque 2; harmonize
  on the rewrite of `main()`.

**Backlog Plane tickets from the `CLAUDEPERS-1` umbrella that never
shipped** (all low priority, none load-bearing):

- `CLAUDEPERS-7` — refine `commit-style` skill to dial down body
  verbosity.
- `CLAUDEPERS-8` — resolve git-hook ref asymmetry in project-manifest
  parse/serialize.
- `CLAUDEPERS-9` — backfill tests for git-hook no-op branches and
  update the e2e.

**README screenshots** — capture the new UI now that it's stable:
welcome wizard (step 1 with detect-stack preselect, step 2 with the
setup summary), free mode with the three cards and an active project,
recent projects screen, Settings panel with both sections. The README
edit is trivial; getting the screenshots right while the app is fresh
in memory is the point.

- *Why now:* all individually innocuous, accumulated enough to clear
  in one focused pass. Closing them keeps the surface clean before
  Global bin install (Deferred 13) ships outwards. Capturing
  screenshots while the UI is fresh in memory is cheaper than coming
  back to it.
- *Cost:* low each. Bounded to one focused session.

### 2 · Presets for the remaining personal stacks (React Native, Vue 3, Laravel)

With the catalog format finalized and the `nestjs` and
`tauri-rust-react` presets already shipped (each with its own
stack-specific skills), three stacks remain on the personal radar:

- **React Native**: presumably reuses some of the React patterns from
  `tauri-rust-react` but with its own testing surface (RNTL, native
  module mocks) and likely a new `react-native-patterns` skill for
  navigation, platform branches and gesture handling.
- **Vue 3**: completely new territory in the catalog. Needs a
  `vue-hexagonal-patterns` skill mirroring the React one (composables
  as application layer, Pinia as the store port, etc.) and possibly
  a `vue-testing-rules` skill.
- **Laravel**: PHP, fundamentally different stack. The agnostic
  `hexagonal-architect` covers principles, but a `laravel-hexagonal-
  patterns` skill (Eloquent vs domain entities, service container as
  composition root, queue jobs as adapters) would carry the weight.

- *Why now:* unblocked. Content work per stack, not engine work.
- *Cost:* medium per stack. Each stack ships independently when
  there's a concrete project that pulls for it — not all three at
  once on speculation.

### 3 · `CLAUDEPERS-10` — pre-commit/pre-push hooks adapt to the project's tooling

Today `base.yaml` ships `pre-commit` and `pre-push` hooks that hard-code
`pnpm` commands. A project on `npm` or `yarn` sees them try to run a
binary it doesn't have and the hooks fail silently. The fix detects the
package manager from lock-file presence (`pnpm-lock.yaml` /
`yarn.lock` / `package-lock.json`) and substitutes the right runner
when materializing the hook.

- *Why now, not later:* the embedded catalog from `CLAUDEPERS-25`
  means any new project that picks `base` inherits the hooks
  immediately. The first time the catalog lands in a non-pnpm repo,
  the hooks die. Cheap to fix; valuable for the moment a second
  stack-flavored preset enters the wild.
- *Cost:* medium. One small algorithm in the writer (or a templating
  pass), tests for each runner, smoke against a non-pnpm fixture.

---

## Next

(No Next items right now — promote from Deferred when triggers fire.)

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
| 14 · Calibrate `tauri-rust-react` catalog set | First live use of the preset on Angel's Plinth side project (Stream-Deck-style touch panel for sim inputs / telemetry — see memory `project_plinth`) surfaces real gaps or false advice in `rust-hexagonal-rules`, `tauri-patterns`, `react-hexagonal-patterns`, `zustand-patterns`, `framer-motion-patterns`. Same calibration cycle that closed `hexagonal-refactor-nestjs` after the Tubegist sweep — not anticipatory. |
| 13 · Global bin install for the CLI | Now items 1, 2 and 3 closed. Ship `claude-fw` as a globally invokable command (`pnpm i -g` from the repo, or publishing to a scoped registry). Deferred because installing it globally before the UI is polished, the catalog has more stacks, and the engine debt is cleared exports an unfinished feel to anyone who tries it from outside. ≈ 1 h once unblocked. |
| 15 · ~~Rethink framework-root UX~~ | **Closed** by `CLAUDEPERS-14` (2026-06-14): built-in catalog embedded in the binary, user folders configurable from Settings with precedence `env > user > built-in`, env var `CFW_CATALOG_PATH` for the dev flow of this repo. Decisions and architecture in ADRs 0003 and 0004. |
| 16 · Onboarding git hooks on fresh clones | Git limitation: `core.hooksPath` is repo-local config (`.git/config`) and is NOT inherited on clone. Now that git hooks ship as a catalog artifact (Recently shipped: `CLAUDEPERS-1`), a fresh clone of any repo using the framework — or a new collaborator joining the project — will NOT have hooks active until they run `claude-fw install`. The install-report line ("Git config: set core.hooksPath = .githooks") mitigates the first install, but the first time someone clones and forgets to run install, the hooks silently don't fire and the catalog looks broken. Surfaced by the `hexagonal-architect` during the planning of `CLAUDEPERS-1` as a known risk explicitly outside the MVP scope. Three options to debate when triggered: (a) a generated block in the installed `CLAUDE.md` with the exact command to run; (b) a `bootstrap.sh` script shipped by the catalog that activates hooks plus whatever else is needed; (c) Claude Code-level detection of `.githooks/` without `core.hooksPath` pointing at it. Trigger: the first time the repo is cloned on another machine and the hooks don't fire, or a collaborator joins the project. |

---

## Recently shipped

- **Polish the desktop UI → real-product experience (Now 1, `CLAUDEPERS-14` umbrella)** — moved the desktop from a four-button vertical stack to a wizard-gated product. Fourteen sub-issues across engine, CLI, Rust and frontend; ADRs 0003 and 0004 record the load-bearing architectural choices. Eight commits over three days (2026-06-13 → 2026-06-14):
  - **Engine multi-source catalog** (`1805a33`, `CLAUDEPERS-15` + `-17` + `-18`): `AggregatedCatalog` decorator with first-wins precedence `env > --catalog-folder > --framework > builtin`, `NoCatalogSourceError`, new CLI flags. Closed the `frameworkRoot` legacy without breaking it. `2ccd1f7` renamed `CatalogReader` → `FsCatalogReader` with deprecated alias.
  - **Stack detection** (`8fbac22` + `0134cac` + `1fea919`, `CLAUDEPERS-16`): `DetectRule` VO, `evaluateDetects` pure service, `StackInspectorPort` + `FsStackInspector` (`dependencies` + `peerDependencies` only, decision H2 / `CLAUDEPERS-28`), `detectStack` use-case, CLI `detect-stack --json`, Tauri binding. `nestjs` and `tauri-rust-react` presets gained their `detects:` blocks.
  - **Embedded catalog** (`15e33fd`, `CLAUDEPERS-25`): `build.rs` copies the catalog dirs into `$OUT_DIR` with a sha256 content hash, `include_dir!` ships them inside the binary, runtime extracts to `$XDG_CACHE_HOME/cfw/builtin-<hash>/` once and purges stale siblings. Also fixed a latent precedence bug in the original injection order.
  - **Documentation** (`7d39723`, `CLAUDEPERS-26` + `-27` + `-28`): ADR-0003 (multi-source migration + `--framework` deprecation path), ADR-0004 (catalog sources as composition concern, with the architect's push-back recorded), `docs/catalog-detection.md` policy.
  - **Project-dir missing modal** (`43361be`, `CLAUDEPERS-24`): `ProjectDirMissingError` + `projectDirExists()` port + CLI `--create-dir` + Tauri `ensure_project_dir` + native confirm modal that chains into the existing `NOT_A_GIT_REPO` flow.
  - **Tauri commands accept user folders + builtin toggle** (`f9a757c` + `8d33f33`): commands accept `catalog_folders` and `allow_builtin`; `run_cli` orders argv so user folders out-rank the built-in. Fixed a latent ordering bug that gave the built-in higher precedence than `--framework`.
  - **Foundation hooks** (`275a274` + `8b0d7b2` + `08fa860`): `useUserCatalogFolders` (persisted + folder validation on add via list comparison), `useRecentProjects` (5 most-recent, sorted by recency), `useActiveProject` (single source of truth + persistence). Test setup gained a `MemoryStorage` shim for `localStorage`.
  - **Components** (`64e17ce`): `ProjectHeader` + hand-rolled `SwitchProjectDropdown` (decision D3, no UI primitives library).
  - **Free mode redesign** (`b9332f6`, `CLAUDEPERS-20` + `-21` + `-23`): `App.tsx` rewritten around `useActiveProject`; three cards (`StatusCard` / `CatalogCard` / `ActionsCard`); ephemeral outcomes that auto-dismiss on success after 5 s and stay sticky on error (decision D1); recent-projects screen when there's no active project; cross-flow reset on project switch with auto silent re-check.
  - **Settings panel** (`8d33f33`, `CLAUDEPERS-22`): `<dialog>`-based modal full-screen (decision D2); user folders CRUD with validation + remove; `Use built-in catalog` toggle persisted as `cfw.useBuiltinCatalog`; CFW_CATALOG_PATH override info row; Restart welcome wizard button.
  - **Welcome wizard** (`475eb71`, `CLAUDEPERS-19`): two-step guided setup (decision F), Step 1 with detect-stack preselect that skips ties (decision A3), Step 2 with init + install sequencing that reuses the existing `PROJECT_DIR_MISSING` / `NOT_A_GIT_REPO` modals but skips the install confirm (the wizard's Set up IS the confirm); gated by `cfw.welcomeWizardCompleted` flag with Skip / Restart paths. NoCatalogBanner surfaces the misconfigured-Settings dead-end with an actionable "Open settings" button instead of pretending it's "no automatic match".
  - End state: from `SetupForm` with four free buttons to a welcome wizard for first-timers, a Linear-style free mode for daily use, recent projects screen, full-screen Settings with multi-source catalog management, and a built-in catalog that ships with the binary. 642 tests across the engine, CLI and desktop.

- **Git hooks as a catalog artifact (`CLAUDEPERS-1` umbrella)** — first artifact type that lives outside `.claude/` and first with an executable bit. Shipped across 5 planned sub-phases + 3 smoke-driven fixes:
  - **1.A–1.E** (`b41e576` → `d3d206a`): engine domain (`GitHook`, closed `HookName` enum, `Preset.gitHookNames`), `resolveExtends` accumulation + dedupe (no `ConflictingHookNameError` needed — id === hookName), Familia A drift, new `GitConfigPort` separated from `WriterPort`, real adapters with `chmod 0o755` and `ChildProcessGitConfig`, lockfile gains its own `gitHooks` section, YAML field `git-hooks:` (decision closed in post-1.D review), CLI report + Rust IPC + desktop Card. Three concrete hooks in `base`: `commit-msg` (Conventional Commits), `pre-commit` (`pnpm lint`), `pre-push` (`pnpm -r test`).
  - `9f4dca5` fix(desktop) `CLAUDEPERS-11`: smoke surfaced that the success banner counted git-hooks toward "N artifacts written to .claude/" — split into separate counters per destination.
  - `646ce5c` refactor(core): renamed `FsProjectInspector` to `LocalProjectInspector` to honestly cover the subprocess method added next.
  - `4140806` → `55ffe64` `CLAUDEPERS-12`: install detects non-git project via `isGitRepo()` and skips `core.hooksPath` gracefully. Hooks still land in `.githooks/`; report names the skip and what to do.
  - `6223c6c` → `88d3171` `CLAUDEPERS-13`: init detects non-git project and emits `NotAGitRepoError`. CLI surfaces it (`--init-git` flag automates the fix); desktop intercepts with a native confirm modal that calls `ensure_git_repo` and retries `initialize` on accept.

- **Settings (with hooks) + per-stack `CLAUDE.md` as catalog artifacts** — closed across three commits:
  - `29bc33a` engine: `Settings` wraps `Permissions + Hooks`; lockfile + drift carry settings hash.
  - `fed6857` engine: `Instructions` VO singleton concatenated from `instructions/<id>.md`; `.claude/CLAUDE.md` materialization; take-over guard via `UnmanagedClaudeMdError`.
  - `ea579e0` desktop: Instructions card, Settings/Instructions singleton drift in status, take-over UI with Retry, structured `CliError`, vitest + RTL baseline.

- **`tauri-rust-react` catalog set** — green-field preset for Rust + Tauri 2 + React + TypeScript + Zustand + Framer Motion projects. Researched against verified primary sources before drafting (deep-research workflow, 109 agents, 22 verified claims, 3 refuted). Five new skills:
  - `72f6d9f` `rust-hexagonal-rules` — Rust language specifics under hex (async fn in traits since 1.75, error handling per layer, traits as ports, workspace organization).
  - `146914b` `tauri-patterns` — Tauri 2 in the adapter layer (state via `app.manage(Mutex)` + `State<'_, T>`, commands in modules not `lib.rs`, `tauri::ipc::Channel<T>` for hot paths instead of `Window::emit`, sidecars with `-$TARGET_TRIPLE` suffix).
  - `366acd3` `zustand-patterns` — Zustand v5 specifics (selectors simple by default, `useShallow` only for selectors that build fresh refs, `subscribeWithSelector` as the external-subscriptions port, slices as a growth response not a default).
  - `a424ce7` `framer-motion-patterns` — Motion decisions beyond the README (individual transforms NOT GPU-accelerated, View Transitions API does not replace Motion for interruptible/interactive animations, layout-prop has real cost).
  - `aa9d1d0` `react-hexagonal-patterns` — frontend hex spine (four-layer table, custom hooks as application layer, stores as ports, adapters wired from composition root, effects discipline).
  - `862dca8` preset `tauri-rust-react.yaml` wiring all five plus the inherited base skills.

- **Catalog calibration from Tubegist refactor sweep** — Item 2 of Now (Calibrate `hexagonal-refactor-nestjs`) closed plus three related upgrades that grew naturally from the sweep:
  - `944388d` skill: `commit-style` documenting message conventions (rule zero "no AI attribution", Conventional Commits with type table, four named body patterns, HEREDOC for multi-line, `--no-ff` merges). Added to `base` preset.
  - `595cf54` agent: `hexagonal-refactor-nestjs` rewritten (148 → 239 lines) folding the 8 lessons accumulated from queue/me/worker/auth/llm refactors: Phase 1 cross-module sweep + comment scan + repo precedents, Phase 2 explicit verdict A–E, "Cuándo NO proponer port abstraction" block, "Comentarios — stale vs explica-coupling" block, "Mappers con omisiones deliberadas" block, rule zero on invariants vs folders.
  - `99da5da` architect decoupled: `hexagonal-architect` agent now language/framework agnostic (66 → 105 lines folding the same 6 lessons that applied to it). TypeScript-specific rules extracted to new `typescript-hexagonal-rules` skill — mirrors the `nestjs-hexagonal-patterns` pattern.
  - `616e510` testing: new agnostic skill `hexagonal-testing-strategy` (pyramid per layer with what/how/volume, fakes >> mocks policy, mappers with omissions, anti-patterns, qualitative health signals) and new `hexagonal-test-reviewer` agent (dual-mode audit/design, one module per session, ad-hoc invocation only — stays out of base preset by design).

---

## Index of related decisions

- [`docs/adr/0001-pr-creator-provider-coupling.md`](adr/0001-pr-creator-provider-coupling.md) — gates two Deferred items (overrides in preset, provider-agnostic `pr-creator`).
- [`docs/adr/0002-node-crypto-in-domain.md`](adr/0002-node-crypto-in-domain.md) — accepted trade-off, no roadmap impact.
- [`docs/adr/0003-multi-source-catalog-migration.md`](adr/0003-multi-source-catalog-migration.md) — closed Deferred 15 by way of `CLAUDEPERS-14`.
- [`docs/adr/0004-catalog-sources-as-composition-concern.md`](adr/0004-catalog-sources-as-composition-concern.md) — locks where the multi-source plurality lives across layers.
