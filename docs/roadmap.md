# Roadmap

Prioritized backlog as of 2026-05-27. Update it when priorities shift
or items ship — a stale roadmap is worse than no roadmap.

Tiers reflect *when*, not *what*:

- **Now** — the next block of work. Already justified, no blockers.
- **Next** — comes after Now, no urgency on its own.
- **Deferred** — explicitly waiting on a named condition. Not
  "someday"; the condition is the trigger.

---

## Now

### 1 · Settings (with hooks) + per-stack `CLAUDE.md` as catalog artifacts

The motor's `Settings` value object currently carries only
`allow`/`deny` permissions. Extend it to model **hooks** too (the
same primitive used in `~/.claude/settings.json` — `PreToolUse` and
relatives), and add a new artifact type: per-preset `CLAUDE.md`
instructions. The writer materializes both alongside `agents/`,
`skills/` and `commands/`.

- *Why now:* the only real "product capability" still missing.
  Requested explicitly. Newly initialized projects will get these
  artifacts as part of the install.
- *Cost:* medium. Touches `Settings` in the domain, the install /
  list use cases, the FS writer, and the Tauri catalog view.

### 2 · Global bin install for the CLI

Ship `claude-fw` as a globally invokable command instead of
`node packages/cli/dist/index.js`. Options on the table: `pnpm i -g`
from the repo, or publishing to a scoped registry.

- *Why now:* quick win. Improves daily use and the demo path.
  Independent.
- *Cost:* low (≈ 1 h).

### 3 · Calibrate the `hexagonal-refactor-nestjs` agent

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

### 4 · Presets for other personal stacks (React, React Native, Vue 3, Laravel)

With the catalog format finalized after item 1 (settings + CLAUDE.md
included), build first-class presets for each stack. Each preset
needs at least one or two stack-specific agents or skills to be more
than an empty `extends: base` shell.

- *Why after item 1:* presets built now would have to be reworked to
  incorporate the richer catalog format. Do them once, with everything
  baked in.
- *Cost:* medium per stack. Content work, not engine work.

### 5 · Technical debt cleanup

Three items the architecture audit flagged as "monitor, don't act":

- Report DTOs triplicated (CLI / Rust / frontend) — consider a shared
  schema if the surface grows.
- `parseSettings` duplicated between `parse-lockfile.ts` and
  `parse-preset.ts`.
- `isErrnoException` duplicated across three `infrastructure/fs/`
  adapters.

- *Why "next" and not "now":* all three are innocuous today. Fold
  them in as cleanup when touching the surrounding code; they don't
  deserve a phase of their own.
- *Cost:* low each.

### 6 · Screenshots for the main README

Capture: empty state, catalog loaded, the Initialize block on a
fresh project, status with drift, successful install. Embed in the
portfolio section of the main README.

- *Why after item 1:* if the UI gains a settings/CLAUDE.md view as
  part of item 1, screenshots taken now go stale.
- *Cost:* low — you capture, the README edit is trivial.

---

## Deferred

Five items waiting on a named condition. Each ships when its trigger
fires, not before.

| Item | Trigger |
|---|---|
| 1 · `overrides:` field in Preset schema (ADR 0001 Option 4) | ≥ 2 work repos need to share the same override — duplicating it across project manifests becomes the pain that justifies the engine change. |
| 2 · Provider-agnostic `pr-creator` (ADR 0001 Option 3) | The framework is set up in a non-GitHub repo (Bitbucket / GitLab). |
| 3 · Sidecar bundling for the Tauri app | You need to distribute the desktop app to a third party. Dev mode is enough until then. |
| 4 · Refactor `jobs/` or `billing/` modules in Tubegist | You decide Tubegist itself needs the refactor. Calibration value alone has diminishing returns after the `users/` module. |
| 5 · Recorded demo or blog post | The roadmap is mostly green and you want a public artifact of the project. |

---

## Index of related decisions

- [`docs/adr/0001-pr-creator-provider-coupling.md`](adr/0001-pr-creator-provider-coupling.md) — gates two Deferred items (overrides in preset, provider-agnostic `pr-creator`).
- [`docs/adr/0002-node-crypto-in-domain.md`](adr/0002-node-crypto-in-domain.md) — accepted trade-off, no roadmap impact.
