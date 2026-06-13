# 0004 — Catalog sources as a composition concern

- Status: accepted
- Date: 2026-06-13

## Context

ADR-0003 settled *that* the engine should support several catalog
sources at the same time. This ADR settles *where* the plurality of
sources lives in the layered architecture.

The initial proposal coming out of the UX debate was to introduce a
discriminated union in `application/`:

```ts
type CatalogSource =
  | { kind: 'builtin' }
  | { kind: 'folder'; path: string }
  | { kind: 'env'; path: string };
```

…and have `CatalogPort` accept a list of these.

The `hexagonal-architect` review pushed back hard on that shape. The
review's argument was that **"there are three kinds of source" is not
a regla de aplicación — it is a detail of how the composition root in
the CLI happens to wire things today**. Application is supposed to know
"how the engine asks for a catalog"; it should not also know "and the
catalog might come from a folder, or from an env var, or from
embedded bytes".

If the discriminated union sits in `application/ports/`, every
existing use case — `install`, `init`, `checkStatus`, `listCatalog` —
becomes aware of the source variants. Adding a fourth source later
(e.g. an HTTP-backed catalog for a future SaaS mode) drags every use
case along for the ride.

That is the symptom the architect was warning about: the surface area
of "things the application layer has to be told" should not grow
every time the *outside* world grows.

## Options considered

### Option 1 — `CatalogSource` is a domain or application type

The discriminated union lives in `application/ports/catalog-source.ts`
(or worse, `domain/`). Use cases accept `readonly CatalogSource[]`.
`FsCatalogReader` is refactored to accept a list.

- ✅ Single type that names every source the engine knows about.
- ❌ Every use case now knows that `'builtin'` is a kind, even though
  no use case ever instantiates one. The information leaks for no
  caller's benefit.
- ❌ Adding a source variant — embedded HTTP catalog, S3, encrypted
  bundle — forces touching every use case signature.
- ❌ `FsCatalogReader` stops being a single-source adapter and
  acquires aggregation logic. Two responsibilities in one class.

### Option 2 — Decorator pattern: aggregator IS a `CatalogPort` (chosen)

`CatalogPort` stays a single contract. `FsCatalogReader` keeps doing
one thing: reading one folder. A new application service
`AggregatedCatalog implements CatalogPort` composes a list of
`CatalogPort`s and exposes them as one — first-wins on collisions,
order matters.

The discriminated union `CatalogSource` only appears in a CLI helper
(`buildCatalogPort` in `packages/cli/src/build-catalog.ts`) that
translates command-line flags into a list of `CatalogPort`s and hands
them to the aggregator. It never crosses the application boundary.

- ✅ Application use cases keep their old signature: they receive a
  `CatalogPort`. They do not know — and should not need to know —
  whether that catalog is one folder, three folders, or a 47-source
  Frankenstein from the CLI.
- ✅ Adding an HTTP-backed source later is a new adapter plus an extra
  branch in `buildCatalogPort`. Zero changes upstream.
- ✅ `FsCatalogReader` stays single-purpose. The aggregation policy
  lives in `application/services/aggregated-catalog.ts`, alongside
  other composition policies.
- ❌ Two `CatalogPort` implementations to remember (`FsCatalogReader`
  and `AggregatedCatalog`). The mental model is "leaf adapter +
  decorator", which is one extra concept compared to "everything
  multi-source from the start". Acceptable cost for the decoupling.
- ❌ Reading code with `catalog: CatalogPort` no longer tells you how
  many sources are behind it. That information is intentionally
  hidden — the trade-off is exactly the point of the port.

### Option 3 — Many ports, one per source kind

`BuiltinCatalogPort`, `FolderCatalogPort`, `EnvCatalogPort` as
separate ports, plus a coordinator that knows how to call each.

- ❌ Triples the surface area of `application/ports/` for no design
  benefit.
- ❌ Doesn't actually solve the "use case knows about source kinds"
  problem — the coordinator still does.

## Decision

Option 2.

- `CatalogPort` (in `application/ports/catalog.port.ts`) stays a
  single contract — one method per artifact kind, no awareness of
  where the data comes from.
- `AggregatedCatalog` (in `application/services/aggregated-catalog.ts`)
  implements `CatalogPort` over a `readonly CatalogPort[]` passed in
  descending precedence. First-wins dedup on `list*`, ordered tries on
  `read*`, `ArtifactNotFoundError` when every source misses. Pure
  composition policy — no I/O.
- `FsCatalogReader` (in `infrastructure/fs/`) is the single-folder
  adapter. It takes one path and reads the folder beneath it. That's
  it. The previous name `CatalogReader` stays as a deprecated alias
  for back-compat.
- The discriminated union for "what kind of source" lives **only** in
  the CLI's `buildCatalogPort` helper, in `packages/cli/src/`. It is
  internal to the composition root.

The wizard, the install use case, the status use case — none of them
know any of this. They depend on `CatalogPort`. End of story for them.

## Consequences

- The application layer can grow new ports without dragging source
  kinds along with them. The next time we add a port (e.g. an
  `ExportPort` for emitting bundles), we don't have to first think
  about "but which catalog source did this come from?".
- Adding a new source — bundled HTTP, S3, embedded WASM, whatever —
  is bounded: one new adapter implementing `CatalogPort`, one new
  branch in the CLI helper. Use cases stay untouched.
- The CLI composition root acquires the responsibility of knowing the
  precedence rules at the point where flags are parsed. That helper
  has its own tests (`packages/cli/src/build-catalog.test.ts`), which
  is the right level: the rules belong to "how this CLI is wired",
  not to the engine.
- Tests of `AggregatedCatalog` use stub `CatalogPort`s — no
  filesystem, no integration cost. The aggregator's correctness is a
  pure-function-style proof.
- Reviewers of future PRs that add a new source must resist the urge
  to introduce a `CatalogSource` type in `application/`. This ADR is
  the reference to point at.
