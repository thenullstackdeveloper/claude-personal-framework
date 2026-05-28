---
name: commit-style
description: Reglas de redacción de mensajes de commit y merge en los proyectos de Angel. Conventional commits + body que explica el porqué + casos específicos (refactor con análisis previo, "no refactor" con cleanup incidental, bloques de shipping multi-fase, merges --no-ff). NO autoriza commits — solo formatea cuando el usuario ya dio el OK.
---

# Commit style

Esta skill define **cómo** se escriben los messages de commit y merge, no **cuándo** se commitea. La regla de "nunca commit/push sin OK explícito del usuario" sigue vigente y la dicta el CLAUDE.md del proyecto — esta skill se activa una vez la autorización está dada.

## Regla cero — sin atribución a IA

Nunca añadir:

- `Co-Authored-By: Claude …`
- `🤖 Generated with [Claude Code]`
- Cualquier mención a Claude, IA, asistente, modelo, etc. ni en subject ni en body ni en footer.

Aplica también a PR descriptions y merge commits. No es opcional ni configurable por proyecto.

## Subject

Formato **Conventional Commits**: `<tipo>(<scope opcional>): <subject>`.

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Funcionalidad nueva visible para el usuario o consumidor del paquete. |
| `fix` | Corrige un bug existente (no "fix lint", eso es `chore`). |
| `refactor` | Cambia estructura interna sin alterar comportamiento observable. |
| `chore` | Housekeeping: lint, format, deps minor, comentarios stale, limpieza. |
| `docs` | Solo documentación (README, ADRs, roadmap, JSDoc puro). |
| `test` | Solo tests añadidos/cambiados sin tocar código de producción. |
| `perf` | Optimización con impacto medible. |
| `build` | Cambios en build system, scripts de compilación. |
| `ci` | Cambios en CI/CD. |
| `style` | Solo formato (espacios, comas). Raro porque `pnpm check` lo hace. |

Reglas:

- Subject en **imperativo presente** ("add", "fix", "remove"), no en pasado ni gerundio.
- **Minúscula** tras los dos puntos.
- **Sin punto final**.
- Objetivo de longitud: **≤72 caracteres**. Si no cabe, mover detalle al body.
- Scope opcional, útil cuando el proyecto tiene paquetes/áreas (`feat(core): …`, `fix(desktop): …`). En monorepos se usa siempre.

## Body

Obligatorio salvo en cambios triviales (typo, rename de variable, dependencia patch).

Explica el **por qué** y, si no es evidente, **cómo encaja en el contexto** (qué decidisteis, qué descartasteis, qué deuda queda). Evita describir el "qué" — el diff ya lo dice.

Líneas a 72 columnas aprox para que `git log` se lea sin scroll lateral.

### Patrón A — refactor con análisis previo

Cuando hubo un análisis de un agente o architect que produjo un plan + decisiones aprobadas, el body **debe** capturar:

1. El veredicto del análisis (qué opción se eligió y de cuántas).
2. Las decisiones cerradas relevantes (las que un lector futuro reabriría si no las ve aquí).
3. Lo descartado importante y por qué (especialmente si fue una opción tentadora).

Ejemplo:

```
refactor(jobs-history): dissolve queue/ module into responsibility-aligned pieces

Hexagonal-architect veredict: B (dissolve, redistribute). The queue/
module was an accidental grouping after F3 step 11 emptied it of its
original enqueue/list/cancel/metrics responsibilities.

- PoolService → infrastructure/database/ under a @Global DatabaseModule.
  Removes the queue/ import from 8 cross-cutting consumers.
- BossService → jobs-history/infrastructure/queue/, colocated with its
  PgBossJobQueue adapter.
- JobsService + spec deleted (dead code since step 11).

Descartado C (hex with DatabasePool + Boss ports): single adapter each,
no second adapter on the horizon → ceremony without value.
```

### Patrón B — "no refactor" con cleanup incidental

Cuando un análisis concluye "ya está bien, no tocar" pero se aprovecha la rama para limpieza menor (comentarios stale, dead imports, etc.), el body **debe** explicar que la rama no produjo refactor estructural y por qué la rama existió igualmente:

```
chore(worker): clean stale comments — refactor not warranted

Hexagonal-refactor analysis on worker/ concluded D (no refactor):
WorkerService is already application-layer-shaped (composes use cases,
zero SQL, zero HttpException). 3 files don't justify 3 empty
domain/application/infrastructure folders.

Cleanup of two stale comments the analysis surfaced:
- worker.service.ts:17-26 — "After refactor B (step 8)" block describes
  a contract the code now embodies; removing.
- worker.service.ts:27-28 — RUN_WORKER warning about the Hono worker,
  which has been disabled since F3.7.1.
```

El **merge commit** de esta rama (ver sección "Merges") debe reforzar que la rama existió a propósito.

### Patrón C — bloque de shipping multi-fase

Cuando un commit cierra un bloque grande compuesto de varias sub-fases (típico de los Bloques 1/2/3 de un item del roadmap), el body **debe** listar las sub-fases o áreas tocadas y mencionar el smoke test si lo hubo:

```
feat(desktop): surface Settings + Instructions and tighten error handling

- Rust + TS types catch up to the engine post-Bloque 2: InstallReport
  gains settings/instructions: bool, StatusReport gains both as
  StatusSingleton, ListPreset/CatalogReport gain instructions.
- Structured CliError { code, message } propagated from Rust to TS.
- StatusView: two singleton rows under the existing 4-bucket grid.
- CatalogView: Instructions card alongside Agents/Skills/Commands.
- InstallReport: take-over branch when code === UNMANAGED_CLAUDE_MD.
- Vitest + RTL baseline in apps/desktop. 23 tests covering the new
  components and the sha helper.

353 tests green total. Cargo check + lint clean. Smoke-tested live:
catalog cards, status drift, take-over flow with Retry.
```

### Patrón D — docs

Para commits que solo tocan documentación (README, ADRs, roadmap), el body explica **qué cambió de fondo** (no qué archivos), preferiblemente con el "trigger" del cambio:

```
docs(roadmap): close Item 1 and reshuffle tiers

- Item 1 (Settings + per-stack CLAUDE.md) shipped across 3 commits —
  moved to a new "Recently shipped" section to keep the trail.
- Now re-numbered. Next: presets/tech debt/screenshots unblocked.
- Deferred gained three Bloque-3 follow-ups, each with explicit trigger.
```

## HEREDOC para mensajes multi-línea

Siempre que el message tenga más de una línea, usar HEREDOC para preservar formato exacto:

```bash
git commit -m "$(cat <<'EOF'
feat(core): add Instructions VO

Body line 1.
Body line 2.
EOF
)"
```

Razones:

- `-m "linea1\n\nlinea2"` no respeta saltos en todas las shells.
- HEREDOC con `'EOF'` (single-quoted) evita interpolación de variables y caracteres especiales.
- Permite revisar el message antes de ejecutar pegándolo en el editor sin escapar.

## Merges

### Merge fast-forward

Cuando la rama es trivial (1-2 commits, sin contexto que preservar), `git merge` por defecto está bien. El historial queda lineal.

### Merge `--no-ff`

Cuando la rama representa una unidad lógica que vale la pena preservar como tal en `git log` (refactor evaluado y aplicado, refactor evaluado y descartado, bloque de shipping multi-fase). El merge commit **debe** explicar por qué la rama existió, especialmente si:

- El veredicto del análisis fue "no refactor" pero se hizo cleanup (justifica que la rama no se "abandone").
- La rama es parte de una serie (Bloque 1/2/3) y conviene mostrar la separación.

Ejemplo:

```
Merge branch 'feature/refactor-worker'

Analysis concluded no refactor (D). Branch kept open for the
incidental cleanup of stale comments the analysis surfaced —
same pattern as the boss.service.ts cleanup.
```

## Lo que esta skill **NO** hace

- **No ejecuta `git commit` ni `git push` sin OK explícito del usuario.** La autorización es una capa separada del formato — la dicta el CLAUDE.md del proyecto.
- **No decide cuándo split-ear** un cambio en varios commits. Eso es decisión del usuario.
- **No genera el subject/body automáticamente** si no hay material claro. Si el cambio es ambiguo, mejor preguntar antes que inventar.

## Anti-patterns a evitar

- `feat: changes` / `update stuff` / `WIP` en `main`.
- Body que repite el subject con más palabras.
- Body que describe el diff (`Added foo.ts`, `Removed bar.ts`) en vez del por qué.
- Subject `feat(*)` cuando el cambio no añade nada nuevo (debería ser `refactor`/`chore`).
- Footers vacíos o `Signed-off-by: nadie`.
- Citar tickets internos como única referencia (`Closes JIRA-1234`) sin explicar de qué iba.
- Atribución a IA (ya cubierto en regla cero, pero repetir porque es el error más frecuente al copiar templates de internet).
