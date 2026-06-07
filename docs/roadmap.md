# Roadmap

Prioritized backlog as of 2026-06-07. Update it when priorities shift
or items ship — a stale roadmap is worse than no roadmap.

Tiers reflect *when*, not *what*:

- **Now** — the next block of work. Already justified, no blockers.
- **Next** — comes after Now, no urgency on its own.
- **Deferred** — explicitly waiting on a named condition. Not
  "someday"; the condition is the trigger.

---

## Now

### 1 · Git hooks as a catalog artifact (`.githooks/`)

The catalog gains a new artifact type, `git-hooks/`, with one file
per hook. Native git hooks (zero deps, no Husky/commitlint), versioned
through the catalog, materialized into the project's `.githooks/`
directory at install time. Pairs naturally with the existing
`commit-style` skill: the skill says *what* a good commit looks like,
the hook *enforces* it.

**Three concrete hooks to ship in the `base` preset**:

- **`commit-msg`** — enforce Conventional Commits on the subject
  line (pattern:
  `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9_.-]+\))?!?: .+`).
  Lets `Merge`, `Revert`, `fixup!`, `squash!` through unchanged.
  Validates format only; language stays a project convention.
  Reference script: `~/Projects/shared-docs/conventional-commits-hook.md`.
- **`pre-commit`** — run `pnpm lint` (biome check). Fast, blocks
  formatting drift before it lands.
- **`pre-push`** — run `pnpm -r test`. Slower (~2–5s) but catches
  regressions before they hit the remote.

**Engine design (to nail in the planning phase, open list)**:

- New entity `GitHook { id, hookName, script, description }`. The
  `hookName` is a closed enum of supported git hook names — at MVP
  `commit-msg | pre-commit | pre-push`; extend by adding to the enum.
- `Preset.gitHookIds: readonly GitHookId[]`. `resolveExtends`
  accumulates + dedupes by id AND validates **no two hooks share the
  same `hookName`** (otherwise ambiguous which one wins on disk).
- Materialization location: `.githooks/<hookName>` in the project
  root — **first artifact that lives outside `.claude/`**. The writer
  must handle a second target directory.
- Executable bit: `fs.chmod 0o755` after writing.
- Activation of `core.hooksPath` (three options to debate during
  planning):
  - (a) writer spawns `git config core.hooksPath .githooks` after
    install — most magical, but breaks the engine's
    no-side-effects-beyond-write rule.
  - (b) install report tells the user to run it once — least
    magical, friction every clone.
  - (c) writer reads `git config --get core.hooksPath` and sets it
    only if unset — idempotent, no surprise overwrite. **My vote
    to open debate**.
- Drift tracking: content hash per hook, same pattern as
  agents/skills/commands.
- Lockfile shape: new `gitHooks: [{ id, hookName, contentHash }]`
  section.
- **UI**: new Card in `<CatalogView>` for "Git Hooks", one extra line
  in the install report when hooks are written.

**Proposed sub-phases (refine in planning, à la Bloque 2)**:

- *1.1* — Engine: `GitHook` entity, `Preset.gitHookIds`,
  `resolveExtends` with hookName-conflict detection, lockfile shape,
  drift, parsers, tests.
- *1.2* — Writer: `.githooks/<hookName>` with chmod + chosen
  activation policy.
- *1.3* — Three concrete hooks in `git-hooks/` (commit-msg,
  pre-commit, pre-push).
- *1.4* — `base` preset declares the three.
- *1.5* — UI Card + install report line.

- *Why now:* (a) `commit-style` already documents the convention but
  enforcement lives outside the catalog — incoherent. (b) lint +
  tests local enforcement is the same family of cross-cutting policy
  as commit format; cheap to bundle once the new artifact type
  exists. (c) Plinth and any future project on the `base` preset
  gets all three for free.
- *Cost:* high. New artifact type (first outside `.claude/`, first
  with executable bit). ~1–2 days engine + content + UI. Plan with
  the `hexagonal-architect` audit first, same as Bloque 2.

### 2 · Polish the desktop UI

Start by extracting `App.tsx` (~350 lines, four flows mixed) into
custom hooks: `useInstallFlow`, `useStatusFlow`, `useInitFlow`,
plus path/persistence wiring. Once the monolith is broken, iterate
UX and missing functionality as sub-items emerging from real usage —
not pre-imagined.

**Sub-phases of the refactor:**

- *0* — extract `buildConfirmMessage` helper (`1dc8767`). ✓
- *1* — extract `useDetectPath` hook (`639b68d`). ✓
- *2* — extract `useCatalogFlow` hook (`4d459d8`). ✓
- *3* — extract `useStatusFlow` hook (`a1c67aa`). ✓
- *4* — extract `useInitFlow` hook (`6c704ee`). ✓
- *5* — extract `useInstallFlow` hook + collapse useStatusFlow's
  setReport escape hatch into `checkSilently` (`819fde7`). ✓
- *6* — extract `usePathPicker` hook (`853f0e5`). ✓
- *7* — extract `<InitReport>` component parallel to `<InstallReport>`
  (`0f21998`). ✓ — App.tsx ends at 198 lines from ~350 originally
  (-43%); two inline error banners remain (catalogError, statusError),
  tracked separately as 1.UX.8.

**UX sub-items surfaced during sub-phase 1 smoke tests** (each ships
as an independent commit).

**Recommended next up** (my vote, pick whichever fits the time
available):

1. **1.UX.9** — engine throws `InvalidFrameworkRootError` on a
   bogus framework root + UI catches it via the existing
   `<ErrorBanner>` plumbing. ~30–45 min, fixes a fresh bug surfaced
   today (silent "0 / 0 / 0" catalog), reuses the infra just shipped
   in 1.UX.8.
2. **1.UX.3 + 1.UX.6** — same family (clear stale status report and
   stale outcome banners on Project root change). ~30 min together,
   small surface, removes confusing cross-project carryover.

Then 1.UX.5 (Load catalog re-press feedback, ~15 min cosmetic) and
the 1.UX.1 + 1.UX.2 pair (tooltips + disable Install, interlocked).
1.UX.7 (project-dir modal) is the heaviest (three layers: engine
error type + Rust command + UI modal) and earns its own session.

**Shipped so far** (UX block):

- 1.UX.4 — preset dropdown legible on dark theme — commit `98baf92`.
- 1.UX.8 — Dismiss on `catalogError` / `statusError` via generic
  `<ErrorBanner>` — commit `2e712cd`.

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
- *1.UX.4* — **Fix preset dropdown styling.** ✓ shipped `98baf92`.
  The `<select>` inside the "Project not initialized" block was
  rendering white-on-white in webkit/Tauri-Linux; fixed with
  `color-scheme: dark` on the select + explicit classes on
  `<option>`.
- *1.UX.5* — **Visible feedback on Load catalog re-press.** When the
  catalog is already loaded and the button is pressed again, only a
  microsecond flicker happens. Add a toast or visible pulse
  confirming the refresh — do not disable the button (re-loading is
  legitimate).
- *1.UX.6* — **Clear stale outcome banners on path change.** Init and
  Install success banners survive a Project root change and keep
  showing as if they belonged to the new project (e.g. "Installed
  preset base" from project A is still visible after switching to
  project B). Same family as 1.UX.3 (stale status report). Clear
  these outcomes when the Project root field changes.
- *1.UX.8* — **Missing Dismiss on `catalogError` / `statusError`
  banners.** ✓ shipped `2e712cd`. Closed via the "option C" path:
  extracted a generic `<ErrorBanner>` component, added
  `dismissError()` to `useCatalogFlow` (keeps the loaded catalog
  intact), and reused the existing `useStatusFlow.dismiss()` for
  the status side. App.tsx now has no inline error `<section>`.
- *1.UX.7* — **Friendly handling when the project directory does not
  exist.** Today if the user types a Project root path whose folder
  does not exist, `initialize` falls through to a write that triggers
  `ENOENT` raw from the filesystem and the banner shows the
  fs-level message verbatim. Replace with: engine returns a typed
  `ProjectDirMissingError` (`code: 'PROJECT_DIR_MISSING'`), the UI
  catches it and shows a native confirmation modal *"The folder X
  does not exist. Create it and continue?"* — on confirm, the UI
  invokes a new Tauri command `ensure_project_dir(path)` that does
  `fs::create_dir_all` and then retries `initialize`; on cancel,
  outcome returns to idle without a red banner. Three-layer change:
  engine (typed error replacing the ENOENT leak), Rust
  (`ensure_project_dir` command), UI (catch + modal + retry in
  `useInitFlow` or its caller). Keeps the engine agnostic to client
  policy — CLI can stay strict, desktop is friendly. Likely shipped
  as 2-3 independent commits per Angel's commit hygiene rule.
- *1.UX.9* — **Silent empty catalog when framework root is invalid.**
  Surfaced during 1.UX.8 smoke tests (2026-06-03): pointing Framework
  root at a path that does not exist returns a "success" catalog with
  `{ presets: [], agents: [], skills: [], commands: [], instructions: [] }`
  and the UI happily renders `<CatalogView>` with "0 / 0 / 0 / 0 / 0",
  no hint that the path was bogus (verified with `node packages/cli list
  --framework /tmp/nope-1.UX.8 --json` → empty arrays, exit 0). Root
  cause is in the engine: `CatalogReader.listArtifactSummaries` swallows
  missing subdirs and yields `[]`. Two-step fix: (a) engine validates
  framework root exists and contains at least one of `presets/ agents/
  skills/ commands/ instructions/` — if none, throw a typed
  `InvalidFrameworkRootError` (`code: 'INVALID_FRAMEWORK_ROOT'`); (b)
  desktop catches it via the existing `<ErrorBanner>` plumbing — no UI
  surface change needed beyond the new error code. Related to but
  distinct from Deferred 15 (which rethinks WHERE the catalog lives);
  this just makes today's model honest.

- *Why now:* the file size and lack of separation makes adding any
  UX or functionality friction. Refactoring first removes the
  blocker for everything that follows.
- *Cost:* medium. Refactor itself is bounded (~1 day) plus
  whatever UX work the next sub-items end up justifying.

### 3 · Presets for the remaining personal stacks (React Native, Vue 3, Laravel)

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

### 4 · Technical debt cleanup

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
  Now item 2 lands — otherwise the screenshots go stale immediately.
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
| 7 · Preview of `.claude/CLAUDE.md` and `.claude/settings.json` in the desktop UI | You want to inspect installed content without leaving the app. Requires `tauri-plugin-fs` and a viewer component. Likely emerges as a sub-item under Now 2 (UI polish) once the monolith is broken. |
| 8 · — | Promoted to Now item 1 on 2026-05-30. ID kept as a gap to preserve historical references in past commits. |
| 9 · Per-stack testing rules skills (`react-native-testing-rules`, `nestjs-testing-rules`, etc.) | You start auditing a project with `hexagonal-test-reviewer` and need stack-specific guidance (RNTL + native module mocks, supertest + TestContainers, etc.). Mirror the pattern of `nestjs-hexagonal-patterns`. |
| 10 · Calibrate `hexagonal-test-reviewer` agent | First live use of the agent on a real project surfaces gaps or false positives in the prompt. Same calibration cycle that closed the refactor agent. |
| 11 · Promote `commit-style` to the CLAUDE.md install flow | The skill exists but each project's CLAUDE.md still needs the "no AI attribution / never commit without OK" rules redundantly. When item 13 (global bin install) ships, evaluate if `claude-fw install` should also patch / append project CLAUDE.md from the catalog. |
| 12 · Surface frontmatter parse errors in `list`/`install` | A second catalog artifact silently ends up without description because of a YAML edge case (today: `: ` in plain scalar broke `hexagonal-test-reviewer` — commit `1f0ad0a`). Today `extractFrontmatterDescription` swallows parse errors and returns `''`, which is defensive but hard to diagnose. When it bites again, change the contract to emit a warning to stderr (or fail loudly in `--json`) when frontmatter exists but description is empty / unparseable. |
| 14 · Calibrate `tauri-rust-react` catalog set | First live use of the preset on Angel's Plinth side project (Stream-Deck-style touch panel for sim inputs / telemetry — see memory `project_plinth`) surfaces real gaps or false advice in `rust-hexagonal-rules`, `tauri-patterns`, `react-hexagonal-patterns`, `zustand-patterns`, `framer-motion-patterns`. Same calibration cycle that closed `hexagonal-refactor-nestjs` after the Tubegist sweep — not anticipatory. |
| 13 · Global bin install for the CLI | Now items 1, 2, 3 and 4 closed. Ship `claude-fw` as a globally invokable command (`pnpm i -g` from the repo, or publishing to a scoped registry). Deferred because installing it globally before the UI is polished, the catalog has more stacks, and the engine debt is cleared exports an unfinished feel to anyone who tries it from outside. ≈ 1 h once unblocked. |
| 15 · Rethink framework-root UX (built-in catalog + user catalogs) | Hoy "Framework root" obliga a apuntar a un clone de este repo; si el path está mal, el dropdown se llena con un catálogo viejo sin más feedback que la ausencia silenciosa del preset esperado (Angel se lo encontró al buscar `tauri-rust-react` el 2026-06-02). **Hipótesis base de Angel para abrir debate (NO decisión)**: la app debería traer un catálogo built-in razonablemente variado, y en una sección Settings dejar registrar una o varias "carpetas de catálogo local" para overrides / agents propios. El modelo mental cambia de "señala el repo" a "la app trae catálogo; tú añades los tuyos". Tradeoffs a debatir cuando se aborde: empaquetar el catálogo dentro del binario vs descargarlo on-demand (firmado/versionado), cómo se actualiza el built-in sin reinstalar, precedencia user > built-in, qué pasa con el flujo dev de este propio repo (que SÍ quiere editar el catálogo en sitio), y si esto debería preceder o seguir al global bin install (Deferred 13) — están entrelazados. Trigger: aparece un segundo usuario potencial (alguien que no eres tú) o el catálogo crece a ≥ 4 stacks y "haz clone del repo y apunta aquí" deja de ser razonable. |

---

## Recently shipped

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
