# Architecture Decision Records

This directory holds the architectural decisions made for this project.
Each record captures the context, the options considered, the decision
itself and its consequences — at the moment it was made.

## Why

A short note here is cheaper than reconstructing months of conversation
later. ADRs are the project's long-term memory.

## Format

Records are markdown files named `NNNN-kebab-case-title.md`, numbered
sequentially. The structure of each file is:

```markdown
# NNNN — Title

- Status: <proposed | accepted | deferred | superseded | rejected>
- Date: YYYY-MM-DD

## Context

Why this decision is on the table. The constraints. What forces are
pushing on the design.

## Options considered

Each option, with honest pros and cons. Even rejected options stay —
the reasoning is the value.

## Decision

The chosen path, with the rationale. If status is `deferred`, name the
preferred path and the condition that triggers picking it up.

## Consequences

What this decision makes easier, what it makes harder, what it locks
in, and what it leaves open.
```

## Index

- [0001 — pr-creator provider coupling](0001-pr-creator-provider-coupling.md) — *deferred*
- [0002 — node:crypto in the domain layer](0002-node-crypto-in-domain.md) — *accepted*
