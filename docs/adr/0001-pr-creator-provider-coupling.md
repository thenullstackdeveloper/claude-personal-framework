# 0001 — pr-creator provider coupling

- Status: deferred
- Date: 2026-05-13

## Context

The `pr-creator` agent (`agents/pr-creator.md`) currently assumes
GitHub: it invokes `gh pr create` directly in several places. The
author uses **Bitbucket at work** and would also want to use this
framework there. The agent as it stands is unusable in any non-GitHub
repository.

This was surfaced while creating the first agent after the engine went
self-hosted (commit `7916259`). The override mechanism designed
earlier — `disable` / `add` / `patch` in the project manifest — was
sized for a different question: *"this project doesn't want X"*. The
question here is subtly different: *"this **class of projects** wants
a different flavor of the same X"*.

Three forces interact:

1. **Provider coupling**: the agent is hardcoded to one CLI (`gh`).
2. **Class-level sharing**: several work repos would share the same
   alternative — the override is not a per-project quirk.
3. **Naming uniformity**: invoking "the agent that creates PRs" should
   ideally use the same name across personal and work projects.

## Options considered

### Option 1 — Inline `patch` in each work project manifest

Each work repo's `.claude-fw.yaml` carries a full `patch:` override
with the Bitbucket version of the agent embedded as YAML literal.

- ✅ Works today, no engine changes.
- ❌ ~80 lines of markdown embedded in YAML per repo. Ugly, loses
  highlight, duplicated across every work repo.
- ❌ Editing the Bitbucket agent means editing every manifest.

Only viable for one-off cases.

### Option 2 — Parallel agent in the catalog + `disable` + `add`

Add `agents/pr-creator-bitbucket.md` to the catalog. Each work repo:

```yaml
preset: base
overrides:
  - disable: agent:pr-creator
  - add: agent:pr-creator-bitbucket
```

- ✅ Works today. Markdown lives in clean `.md` files, reusable across
  work repos.
- ❌ The **agent name changes between contexts** (`pr-creator` vs
  `pr-creator-bitbucket`), breaking mental uniformity.
- ❌ Still duplicates the `disable+add` block in every work manifest.

### Option 3 — Provider-agnostic smart agent

Refactor `pr-creator.md` to detect the remote provider from
`git remote -v` and branch:

- `github.com` → `gh pr create`
- `bitbucket.org` / `*.bitbucket.com` → `bb pr-create`
- `gitlab.com` → `glab mr create`

- ✅ No overrides needed. Same name everywhere. Works in every repo.
- ✅ No engine changes required.
- ⚠️ Agent prompt grows by ~15-20 lines, slight token cost per
  invocation.
- ⚠️ Assumes the three CLIs are flow-equivalent (they roughly are —
  title, body, base branch are universal concepts).

### Option 4 — `overrides:` field in Preset schema (engine change)

Extend the engine so that a Preset itself can carry overrides, not
only project manifests:

```yaml
# presets/work-bitbucket.yaml (hypothetical)
extends: base
overrides:
  - disable: agent:pr-creator
  - add: agent:pr-creator-bitbucket
```

Each work repo: `preset: work-bitbucket`. Single source of truth for
the class.

- ✅ Solves the class-level sharing problem cleanly.
- ❌ Real engine work: schema, parser, `resolveExtends` semantics
  (apply overrides along the chain, in order), new tests for edge
  cases.
- ❌ Doesn't avoid Option 2's naming problem on its own.

## Decision

**Deferred.** No action until the first work repository is configured
with this framework.

**Preferred path on activation: Option 3** (provider-agnostic smart
agent). The provider difference between `gh`, `bb` and `glab` is a
matter of which CLI to call — the PR flow itself (title, body, base
branch, draft flag) is identical across providers. A single agent that
branches at the CLI invocation is simpler than maintaining parallel
agents.

Fallback: if the work-flavor of `pr-creator` accumulates differences
beyond provider (review process, deploy hooks, internal tooling), then
revisit and pick **Option 2** combined with **Option 4** — that is,
introduce Preset-level overrides so the class-level config lives in
one place.

## Consequences

- The agent currently in the catalog ships as GitHub-only. This is
  acceptable while the framework is only used in personal projects on
  GitHub.
- Engine schema for Preset stays small — no `overrides:` field added
  preemptively. The motor remains simple until a real need pushes it.
- A known limitation is recorded in plain sight, so a future reader
  (or interview reviewer) sees it was identified deliberately, not
  overlooked.
- When Option 3 is activated, this ADR should be superseded by a new
  ADR documenting the actual refactor and the chosen detection
  heuristic.
