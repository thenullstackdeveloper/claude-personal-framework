# 0002 — node:crypto in the domain layer

- Status: accepted
- Date: 2026-05-14

## Context

The domain layer (`packages/core/src/domain/`) follows a strict rule:
no imports of I/O, frameworks, or anything that changes when the
infrastructure changes. The architecture audit verified this holds
across the whole domain tree — with **one exception**:

`domain/model/content-hash.ts` imports `createHash` from `node:crypto`.
`ContentHash` is a value object that wraps a SHA-256 digest; it is used
to detect drift between the catalog and what a project has installed.

`node:crypto` is a Node built-in. A literal reading of the dependency
rule ("the domain imports nothing from outside") flags this as a
violation. The question is whether it actually is one, or a justified
trade-off worth recording.

## Options considered

### Option 1 — Leave `node:crypto` in the domain (chosen)

`ContentHash.of(content)` calls `createHash('sha256')` directly.

- ✅ `ContentHash.of()` stays a synchronous factory. So do
  `Agent.of()`, `Skill.of()`, `Command.of()`, which compute their hash
  on construction.
- ✅ SHA-256 is a pure, deterministic function — same input, same
  output, always. It touches no file, no network, no clock. The
  *spirit* of the dependency rule is "nothing that changes when you
  swap infrastructure"; a hash algorithm does not.
- ⚠️ It is technically a `node:*` import. The domain would not run
  unchanged on a runtime without Node built-ins (a strict browser
  sandbox). The project targets Node + Tauri, so this is not a present
  risk.

### Option 2 — Introduce a `HashPort`

Define a `HashPort` in `application/`, implement it with `node:crypto`
in `infrastructure/`, inject it where hashes are computed.

- ✅ Purist: zero `node:*` imports in the domain.
- ❌ Every entity factory that computes a hash (`Agent.of`, `Skill.of`,
  `Command.of`, `ContentHash.of`) would need the hasher injected, or
  would have to become asynchronous. A clean synchronous constructor
  becomes a parameterized or async one across the whole model.
- ❌ Buys a theoretical decoupling. The realistic "what if" — changing
  the hash algorithm — is itself a domain decision, not an
  infrastructure swap, so a port would not even be the right tool for
  it.

### Option 3 — Pure `sha256()` helper in the domain

Extract a standalone `sha256(content): string` function in the domain
that internally uses `node:crypto`, isolating the import to one place.

- ✅ Single point of contact with `node:crypto`.
- ❌ That single point of contact is already exactly what `ContentHash`
  is. The helper would add an indirection without removing the import.

## Decision

**Option 1.** `node:crypto` stays in `ContentHash`.

It is a deliberate, bounded trade-off, not architectural debt:

- SHA-256 is deterministic and pure — morally equivalent to `Math`, not
  to I/O.
- The import is confined to a single value object. `ContentHash` is
  already the one place that knows about hashing.
- A `HashPort` would contaminate every entity factory in the model for
  a decoupling with no realistic payoff.

This matches the project's own `hexagonal-architect` guidance, which
treats `node:crypto` for hashing as "discutible — a pure deterministic
primitive without I/O" and explicitly allows keeping it in the domain
with a justifying note. This ADR is that note.

## Consequences

- The domain has exactly one `node:*` import, and it is documented.
  Any future audit can match it against this record instead of
  re-litigating it.
- The domain is coupled to a Node-capable runtime. Acceptable: the
  engine runs under Node (CLI) and is spawned as a Node subprocess by
  the Tauri app. If the engine ever had to run in a pure browser
  context, this decision would need revisiting — and Option 2 would
  then be the path.
- Entity factories stay synchronous. No async ripple through the model.
