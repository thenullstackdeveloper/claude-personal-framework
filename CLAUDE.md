# claude-personal-framework

Engine that materializes reusable Claude Code agents/skills/commands
(a versioned catalog) into any project. Monorepo: `packages/core` (the
hexagonal engine), `packages/cli` (CLI port), `apps/desktop` (Tauri port).

## Working agreement

**Commits and pushes — never without explicit confirmation.**

- Do **not** run `git commit` or `git push` until Angel confirms it in
  that moment. "One commit per phase", agreed early on, describes the
  *granularity* of commits — it is **not** standing authorization to
  commit on your own.
- A `PreToolUse` hook enforces this: every commit/push triggers a
  confirmation prompt. Treat the hook as a safety net, not a substitute
  for asking — propose the commit in plain words first.

**New functionality is tested live before it is committed.**

- `build` + `test` + `lint` passing is *automatic* validation, not
  proof the feature works. New behavior (a command, a UI flow, a Rust
  handler) must be exercised by Angel in a real run.
- Correct order: write → `build`/`test`/`lint` green → **Angel tests it
  live** → propose the commit → wait for OK. Never commit unproven
  functionality, especially anything that could break existing behavior.

**Commit hygiene.**

- No AI attribution: no `Co-Authored-By`, no "Generated with…" footers,
  no mention of Claude/AI in messages.
- Conventional style (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- One commit per logical unit.

## Architecture

Hexagonal (ports & adapters), enforced in `packages/core`:

- `domain/` — entities, value objects, domain services. Pure TypeScript,
  zero I/O or framework imports. The one documented exception is
  `node:crypto` in `ContentHash` (see `docs/adr/0002`).
- `application/` — use cases, ports (interfaces consumers depend on),
  shared services. Depends only on `domain/`.
- `infrastructure/` — adapters implementing the ports (fs, yaml, json,
  markdown). Depends inward.
- CLI and the Tauri app are **ports over the same engine**. The desktop
  Rust side must not reimplement engine logic — it spawns the CLI as a
  subprocess. Catalog/layout rules live in the engine, never in a port.

When in doubt about placement, the `hexagonal-architect` agent is the
reference.

## Stack & commands

pnpm workspaces · TypeScript strict · Biome (lint + format) · Vitest ·
Tauri 2 (React 19 + Vite + Tailwind 4).

```bash
pnpm -r test          # run all tests
pnpm -r build         # type-check + emit
pnpm lint             # biome check
pnpm check            # biome check --write (fix formatting)
```

Desktop app: see `apps/desktop/README.md` (Linux/Wayland needs
`WEBKIT_DISABLE_DMABUF_RENDERER=1`).

## Decisions

Architectural decisions are recorded in `docs/adr/`. Read them before
revisiting a settled choice.
