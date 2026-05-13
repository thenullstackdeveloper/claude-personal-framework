# claude-personal-framework

A personal framework for packaging reusable [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
agents, skills and commands into a versioned catalog and installing them
into any project with a single command.

Built around two ideas:

- **Compose, don't copy.** Define agents/skills/commands once. Group
  them into presets. Reuse across projects.
- **Project-level overrides.** A project can `disable`, `add` or
  `patch` any inherited artifact, so the framework adapts to projects
  that don't follow your default conventions.

## The problem this solves

After a few months using Claude Code, you accumulate agents, skills,
commands and architectural conventions that work for you. Every new
project pays the same tax: copy a dozen markdown files, edit a couple,
forget which version is the canonical one, repeat.

This framework is the answer: a single source of truth in a git repo,
a CLI that materializes the right combination into `.claude/` of any
target project, and an override mechanism so projects can deviate
without forking the catalog.

## How it works

Three layers, in increasing project-specificity:

```
┌─────────────────────────────────────────────────────────────┐
│  Catalog              presets/    agents/   skills/   commands/
│  (this repo)          base.yaml   *.md      *.md      *.md      
└─────────────────────────────────────────────────────────────┘
                                │
                                │  resolveExtends + applyOverrides
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Project manifest     .claude-fw.yaml in the target project │
│                       └ preset: <name>                      │
│                       └ overrides: [disable, add, patch]    │
└─────────────────────────────────────────────────────────────┘
                                │
                                │  claude-fw install
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Materialized output  .claude/agents, skills, commands      │
│  (gitignored)         (what Claude Code actually reads)     │
└─────────────────────────────────────────────────────────────┘
```

A **preset** declares a list of artifact ids and can extend other
presets. Resolution flattens the chain (parent ids before child ids,
deduplicated). Overrides apply on top of that resolved preset:

```yaml
# .claude-fw.yaml in a target project
preset: react-native
overrides:
  - disable: agent:hexagonal-enforcer   # work repo without hexagonal
  - add: agent:legacy-mvc-helper        # something extra
  - patch: agent:docs-manager           # different body for this repo
    content: |
      ---
      name: docs-manager
      ---
      Custom body…
```

## Quick start

Inside this repo:

```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js install --framework . --project .
```

The last line is the framework configuring **itself**: agents declared
in `presets/base.yaml` are loaded from `agents/` and materialized
under `.claude/agents/`.

To install into another project:

```bash
cd /path/to/your/project
echo "preset: base" > .claude-fw.yaml
CLAUDE_FW_ROOT=/path/to/claude-personal-framework \
  node /path/to/claude-personal-framework/packages/cli/dist/index.js install
```

(A global bin install is on the roadmap; for now invoke via `node`.)

## Architecture

Hexagonal (ports & adapters):

```
packages/core/src/
├── domain/              ← entities, value objects, domain services
│   ├── model/           Agent, Skill, Command, Preset, Composition,
│   │                    ContentHash, Override, Settings, ids
│   ├── errors/          DomainError + typed subclasses
│   └── services/        resolveExtends, applyOverrides
├── application/         ← use cases + ports
│   └── use-cases/install/
│       ├── install.ports.ts      (CatalogPort, WriterPort)
│       └── install.use-case.ts   (pure orchestration)
└── infrastructure/      ← adapters that implement ports
    ├── yaml/            parsePreset, parseProjectManifest
    └── fs/              CatalogReader, ClaudeWriter

packages/cli/            ← CLI port over the same engine
└── src/                 install command + arg parsing
```

The domain has zero filesystem or framework imports. Adapters depend
inward on the domain. The CLI is one port over the use case; a Tauri
desktop app (on the roadmap) is a future second port over the same
engine.

## Project layout

```
.
├── agents/              Catalog: source of truth for agents
├── skills/              (empty for now)
├── commands/            (empty for now)
├── presets/             Catalog: preset YAMLs
│   └── base.yaml
├── packages/
│   ├── core/            Engine: domain + application + infrastructure
│   └── cli/             CLI port
├── apps/                (reserved for desktop app)
├── docs/
│   └── adr/             Architecture Decision Records
├── .claude/             Output of `claude-fw install` (gitignored)
└── .claude-fw.yaml      Project manifest (this repo configures itself)
```

## Status

- ✅ Domain model + composition resolver (extends chains, diamond
  inheritance, cycle detection)
- ✅ YAML + filesystem adapters
- ✅ Install use case with content-hashed entities
- ✅ CLI `claude-fw install`
- ✅ Self-hosting: this repo's own `.claude/` is materialized by the
  engine
- 🚧 Sync with content lockfile (detect drift, apply updates)
- 🚧 `overrides:` field in Preset schema (ADR 0001)
- 🚧 Provider-agnostic `pr-creator` (ADR 0001)
- 🚧 Tauri desktop app
- 🚧 Global bin install

## Architectural decisions

Recorded in [`docs/adr/`](docs/adr/). Each record captures the
context, the options considered (including the rejected ones), the
decision and its consequences.

## Development

```bash
pnpm install              # install deps
pnpm -r test              # run tests (141)
pnpm -r build             # type-check + emit dist/
pnpm lint                 # biome check
pnpm check                # biome check --write (fix formatting)
```

TypeScript strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Biome for lint
+ format. Vitest for tests.
