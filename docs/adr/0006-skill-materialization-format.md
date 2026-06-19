# 0006 — Skill materialization format: `<id>/SKILL.md` folder layout

- Status: accepted
- Date: 2026-06-19

## Context

The engine has shipped since day one with `ClaudeWriter` materializing
skills as flat `.claude/skills/<id>.md` markdown files — the same shape
the catalog source uses. Agents and commands followed the same flat
convention.

A live install against `~/Projects/my-budget` (a fresh project with the
`react-native` preset) surfaced that **0 of 8 framework skills appeared
in Claude Code's `/skills`** menu. Only the user's plugin-provided
skills (stripe-*, frontend-design) were listed. Materialization was
correct on disk; the framework writer was honoring its contract; the
lockfile reported "no drift". But the artifacts were invisible to the
target product.

The `claude-code-guide` agent, citing the official docs at
[code.claude.com/docs/en/skills.md](https://code.claude.com/docs/en/skills.md),
confirmed the canonical format Claude Code's skill discovery walks:

- **Skills**: `.claude/skills/<id>/SKILL.md` (directory + entrypoint).
  The identifier is the **directory name**, not the YAML frontmatter
  `name:` field. `description:` drives auto-invocation.
- **Agents**: `.claude/agents/<id>.md` (flat file, unchanged).
- **Commands**: `.claude/commands/<id>.md` (flat file, unchanged).

Project-level skills (`.claude/skills/`) are fully supported, walked
automatically alongside user-level (`~/.claude/skills/`) and plugin
skills. No settings gate. When a project skill shares a name with a
user skill, the project version takes precedence.

The bug is silent: tests pass, install reports no drift, the lockfile
hashes match, and yet the framework's reason for existing — surfacing a
versioned catalog of skills inside Claude Code — does not work.

## Options considered

### Option (a) — Adapter rewrites the path, sweeps the legacy flat file inline

`ClaudeWriter.writeSkill` mkdirs `<id>/`, writes `SKILL.md`, and before
doing either calls `rm(.claude/skills/<id>.md, { force: true })` to
remove the orphan left by the pre-fix writer. `deleteSkill` removes the
whole `<id>/` directory (supports the sibling-asset surface the format
is designed to carry per Claude Code docs).

- ✅ Single-file change. The legacy path is an infrastructure detail;
  the only thing that ever produced it is the adapter and the only
  thing that needs to be aware of the format change is the adapter.
- ✅ Use-case unchanged. The install pipeline already calls `writeSkill`
  for every artifact in the composition every run, so the sweep
  converges on every install.
- ✅ `WriterPort` unchanged. CLI / Rust / desktop transit layer
  untouched. Contract from ADR-0005 holds.
- ❌ Inline `rm` is forever-debt until every managed project has been
  re-installed at least once. Inline TODO comment + this ADR mark the
  removal window.

### Option (b) — `ProjectMigrator` use case

A new application use-case sweeps `.claude/skills/*.md` flat files that
match a tracked id before install runs.

- ✅ Explicit. Migration as a first-class concept.
- ❌ Adds a port + adapter pair for a one-shot, transient bug fix.
- ❌ Surface grows for no architectural gain; the lockfile is hash-only
  and the install use-case already rewrites every artifact on every run,
  so the sweep doesn't need its own pipeline stage.

### Option (c) — Lockfile-aware delete

On install, for every skill in the previous lockfile, explicitly delete
the OLD-shape path before writing the new shape.

- ✅ Clean drift semantics — every legacy path delete is paired with a
  lockfile entry.
- ❌ Couples the install use-case to a transient migration concern that
  belongs in the adapter. Bleeds infrastructure detail upward.
- ❌ Same convergence guarantee as (a) with more code.

## Decision

**Option (a)**. `ClaudeWriter.writeSkill` materializes
`.claude/skills/<id>/SKILL.md` and sweeps the legacy flat
`.claude/skills/<id>.md` before doing so. `ClaudeWriter.deleteSkill`
removes the whole `<id>/` directory. `WriterPort` JSDoc documents the
materialized shape so future adapters honor it.

Hexagonal-architect verified the surface area before the change: only
`ClaudeWriter` (the adapter) and its own tests pin the path shape;
lockfile is hash-only with no paths; drift is pure domain over hashes
and never inspects disk; report DTOs carry artifact IDs only (no paths
leak to CLI / Rust / desktop).

## Consequences

- Re-installing converges every project to the correct shape on the
  first `claude-fw install` after this fix, including the legacy sweep.
- Self-hosting: the framework's own repo did not previously materialize
  `.claude/skills/`. The first self-install after this fix populates it
  for real — endorsed as dog-fooding.
- Catalog **source** format remains flat (`frameworkRoot/skills/<id>.md`).
  This is an explicit non-decision: the source format is independent of
  the materialized format. When the catalog needs a skill that ships
  with sibling assets (scripts, examples, reference docs), promote that
  ticket separately. Tracked as Deferred 18.
- The inline `rm(legacyPath)` line in `writeSkill` is transient debt.
  Inline TODO points at this ADR. Removal trigger: once every project
  the framework has been installed into has been re-installed at least
  once with the fix in place. The author tracks this informally; no
  automated invariant.

## Pointers

- Discovery docs: <https://code.claude.com/docs/en/skills.md>
- Implementation: `packages/core/src/infrastructure/fs/claude-writer.ts`
- Port JSDoc: `packages/core/src/application/ports/writer.port.ts`
- Tests: `packages/core/src/infrastructure/fs/claude-writer.test.ts`
- Plane umbrella: `CLAUDEPERS-50`
