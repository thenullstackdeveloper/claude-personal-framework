---
name: plane-conventions
description: Convenciones de Angel para gestionar tareas con Plane (self-hosted en homelab) vía el MCP del proyecto actual. Define cuándo crear ticket, cómo redactar título/descripción/labels/prioridad, qué estados del workflow y cómo se vinculan tickets con commits y PRs. NO autoriza operaciones en Plane — solo formatea y guía cuando el usuario ya dio el OK.
---

# Plane conventions

Esta skill describe **cómo** se usa Plane en los proyectos de Angel, no **cuándo** Claude debe operar sobre él de forma autónoma. La regla "nunca crear/cerrar/actualizar tickets sin OK explícito del usuario" es vigente al mismo nivel que la regla de commits — esta skill se activa una vez la autorización está dada.

## Contexto

- Plane está self-hosted en el homelab de Angel.
- **Un workspace, un proyecto Plane por cada proyecto de código**. No hay un único workspace global.
- **Un usuario MCP dedicado por proyecto** con permisos limitados a ese proyecto. Por eso cada repo configura su propio `.mcp.json` apuntando al endpoint Plane con el token del usuario de ese proyecto.

## Regla cero — aislamiento entre proyectos

**El MCP cargado en la sesión expone solo el proyecto actual.** No es una ventana al workspace global ni a otros proyectos.

- Nunca asumir que se puede listar/crear/modificar issues fuera del proyecto cargado.
- Si el usuario menciona otro proyecto, decirle explícitamente que esta sesión no tiene acceso y que cambie de contexto (otro repo, otra sesión).
- Si las tools del MCP devuelven referencias a otros proyectos por error, ignorarlas — no son operables.

Este aislamiento es **un guardrail del modelo de permisos**, no una sugerencia. Refleja la decisión consciente de un-usuario-por-proyecto.

## Vocabulario Plane

- **Workspace**: contenedor superior (uno por usuario en el homelab de Angel).
- **Project**: contenedor de tickets (un proyecto Plane = un repo de código).
- **Issue**: la unidad de trabajo. Equivalente a ticket / tarea.
- **Module**: agrupación temática de issues dentro de un proyecto (épicas).
- **Cycle**: ventana temporal (sprint) de issues.
- **State**: posición del issue en el workflow (Backlog/Todo/In Progress/Done/Cancelled por defecto).
- **Label**: etiqueta tipada que clasifica el issue por naturaleza.
- **Priority**: Urgent / High / Medium / Low / None.

## Formato canónico de un issue

### Título

- **Imperativo en presente** ("Add commit-msg hook to base preset", "Fix preset dropdown on dark theme").
- **Sin prefijo de tipo** (`feat:`, `fix:`) — la clasificación va en labels, no en el título.
- **≤ 72 caracteres**. Si no cabe, el detalle va a la descripción.
- **Sin punto final**.
- En el idioma del proyecto (inglés si los commits del repo son en inglés, español si lo son en español). No mezclar.

Ejemplos buenos:

```
Add commit-msg hook to base preset
Fix preset dropdown legibility on dark theme
Refactor App.tsx into custom hooks
```

Ejemplos malos:

```
feat: add commit-msg hook                  ← prefijo de tipo en el título
Added stuff                                ← pasado + vago
fix the bug with the dropdown that was...  ← > 72 chars, no imperativo
```

### Descripción

Markdown. Mínimo dos secciones; añade más si el contexto lo pide:

```markdown
## Contexto

Por qué existe el ticket, qué problema resuelve, qué decisiones lo
preceden. Si hay un análisis previo (hexagonal-architect, deep-research),
enlazar o resumir.

## Criterio de aceptación

Lista accionable de lo que tiene que ser cierto para cerrarlo. Cada
punto es verificable: "X comportamiento observable", "tests cubren Y",
"docs/roadmap.md refleja Z".

## Notas (opcional)

Riesgos, trade-offs, dependencias, alternativas descartadas.
```

No describir el "qué" en prosa larga — el criterio de aceptación lo dice más claro. No copiar contenido del roadmap; enlazar.

### Labels (vocabulario base)

Reflejan tipo de trabajo, paralelo a Conventional Commits + estados meta:

| Label | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva. |
| `fix` | Corrige un bug existente. |
| `refactor` | Reestructura sin cambiar comportamiento observable. |
| `chore` | Housekeeping (deps, lint, format). |
| `docs` | Solo documentación. |
| `test` | Solo tests. |
| `tech-debt` | Deuda técnica identificada, no urgente. |
| `blocked` | Bloqueado por algo externo. Comentar qué bloquea. |
| `needs-design` | Falta decisión de diseño/arquitectura antes de poder ejecutar. |

Un issue lleva **un** label de tipo (`feat`/`fix`/...) más, opcionalmente, uno de los meta (`blocked`/`needs-design`/`tech-debt`).

### Priority

- **Urgent**: solo si bloquea trabajo o tiene impacto en producción ahora. Raro en proyectos personales.
- **High**: siguiente en cola con compromiso de hacerlo en la ventana actual.
- **Medium**: por defecto para issues confirmados.
- **Low**: nice-to-have, sin urgencia.
- **None**: solo en backlog sin compromiso.

No inflar prioridades — si todo es High, nada lo es.

## Estados del workflow

Default de Plane, con la semántica que Angel les da:

| Estado | Semántica |
|---|---|
| `Backlog` | Ideado, sin compromiso de ejecutar. Para incubar. |
| `Todo` | En cola, comprometido, no empezado. |
| `In Progress` | Trabajándose **activamente**. No dejar issues colgados aquí. |
| `Done` | Cerrado. Lo dispara el merge del PR asociado (o el commit directo a main si no hay PR). |
| `Cancelled` | Decisión consciente de no hacerlo. El **último comentario** explica el porqué. |

Transiciones esperadas: `Backlog → Todo → In Progress → Done`. Saltarse `Todo` (Backlog → In Progress directamente) está bien si empieza a trabajarse el día que se decide.

## Jerarquía y agrupación

Angel está en **Plane Community Edition**, lo cual define qué primitivas hay disponibles:

- **NO existen Epics ni Work Item Types custom** en Community. Esas dos primitivas son de Plane Pro. Olvidarlas — no hace falta y la documentación oficial de Plane las menciona en muchos contextos asumiendo Pro.
- La jerarquía se modela con **parent / sub-issues** sobre work items normales.
- La agrupación temática se modela con **modules**.
- La ventana temporal (sprint) se modela con **cycles**.

### Parent / sub-issues

Primitiva canónica para "tarea con sub-tareas". Cualquier work item puede tener:

- **Un parent** (campo `parent` en su payload).
- **N sub-issues** (work items que apuntan a él vía `parent`).

Casos típicos:

- Un Now item del roadmap se modela como **work item paraguas** + **N sub-issues**, una por sub-fase. Cuando se aborda en planning con `hexagonal-architect`, las sub-fases salidas del plan se crean como sub-issues con `parent = paraguas_id`.
- Un bug grande que requiere varios commits puede tener una sub-issue por commit / por fase de la corrección.

El paraguas tiene su propio label de tipo (`feat` si añade funcionalidad nueva, `refactor` si reestructura, etc.). Cada sub-issue tiene el suyo según lo que aporte.

### Modules

Agrupación **temática transversal** (no jerárquica). Un work item puede pertenecer a varios modules a la vez; los modules cruzan paraguas / sub-issues sin importar quién es parent de quién.

Útil para:

- Temas que cruzan varios Now items ("Linux-first", "Refactor de UX", "Documentación").
- Iniciativas largas que agrupan trabajo de tipos heterogéneos.

NO útil para:

- Sustituir la jerarquía padre-hijo. Si el trabajo tiene una raíz clara, usar parent/sub-issues.
- Etiquetar tipo de trabajo. Para eso están los labels.

Activos por defecto en Community (`module_view: true`).

### Cycles

**Ventanas temporales** tipo sprint. Un work item pertenece a 0 o 1 cycle.

Útil cuando Angel quiera comprometerse a una ventana ("esta semana entran estos 5 items, el resto al siguiente cycle"). Desactivados por defecto en Community (`cycle_view: false`); activar a posteriori con `update_project_features({ cycles: true })` solo cuando se vaya a usar de verdad. No anticipatorio.

### Cómo decidir

- ¿Es una sub-tarea de algo concreto? → **parent**.
- ¿Cruza varios paraguas por tema? → **module**.
- ¿Es compromiso de "lo entrego en X días"? → **cycle**.
- ¿Es clasificación de tipo (bug, feat, ...)? → **label**.

Los cuatro son ortogonales y pueden combinarse: una sub-issue con `parent` (jerarquía) puede estar en un `module` (tema) y un `cycle` (ventana) y llevar el label `fix` (tipo).

## Vinculación con commits y PRs

- **El subject del commit no menciona el ticket.** El subject sigue Conventional Commits y se lee sin ruido en `git log`.
- **El body del commit puede mencionar el ticket** cuando aporta contexto: `Refs: PLN-123`. No `Closes:` desde el commit — el cierre lo hace el merge del PR (o el cierre manual si va directo a main).
- **El body del PR usa `Closes PLN-123`** cuando merged debe cerrar el ticket. `Refs PLN-123` cuando solo aporta contexto sin cerrar.
- **Un PR puede cerrar varios tickets** si el work se entregó atómicamente: `Closes PLN-123, PLN-124`.

Si el repo está en GitHub y el MCP de Plane soporta sincronización con la integración de GitHub, dejar que la integración maneje el cierre cuando el PR se mergee. Si no, cerrar el ticket manualmente en el momento del merge.

## Cuándo Claude debe sugerir crear / actualizar ticket

**Sugerir crear ticket**:

- Tarea con scope estimado > ~1 hora.
- Decisión que afecta a más de un fichero o a la arquitectura.
- Work-in-progress que no se commiteará en la misma sesión.
- Bug encontrado durante el trabajo en otra cosa, que no se va a arreglar ahora mismo.

**Sugerir transicionar Todo → In Progress**: cuando realmente se empieza a trabajar el ticket (no al pensarlo).

**Sugerir transicionar In Progress → Done**: tras el merge del PR (o el commit directo a main).

**NO sugerir ticket para**:

- Typos, rename de variable, cleanup de comentarios.
- Bug menor encontrado y arreglado en la misma sesión, en el mismo commit.
- Refactor de un único fichero dentro del scope de otra tarea.
- Lo que se va a commitear y mergear hoy sin "rastro" pendiente.

La regla operativa: **si el work tiene rastro futuro (otra sesión, otra persona, otro día), merece ticket; si se cierra hoy mismo, no**.

## Cuándo Claude NO debe operar en Plane sin OK explícito

Misma regla que commits: **nunca sin confirmación del usuario en el momento**.

Aplica a:

- Crear, editar o cerrar issues.
- Cambiar estado (`Todo` → `In Progress`, etc.).
- Cambiar labels, prioridad, asignación.
- Añadir comentarios.
- Cualquier operación destructiva (borrar comentarios, eliminar issues).

Pedir OK aunque el usuario haya autorizado una operación similar antes en la sesión — el OK es **por operación**, no per-sesión.

## Operaciones de lectura — seguras sin confirmación

Listar, buscar, leer descripción/comentarios son inocuas y no necesitan OK explícito:

- Listar mis issues activos.
- Buscar issues por estado / label / prioridad.
- Leer descripción y comentarios de un issue.
- Consultar el workflow de estados del proyecto.

Si el usuario solo quiere contexto ("¿qué tengo en In Progress?"), responder con la lista directamente; no preguntar antes de leer.

## Lo que esta skill NO hace

- **No documenta URLs ni tokens del MCP.** Esos viven en el `.mcp.json` del proyecto, ortogonal al catálogo.
- **No reemplaza el roadmap.** El roadmap es donde se debate y prioriza; el ticket se crea cuando hay decisión de ejecutar. Items aún en debate o explícitamente diferidos viven en el roadmap, no en Plane.
- **No define los nombres exactos de las MCP tools** (`mcp__plane__list_issues` o similar). Esa capa la maneja Claude directamente al cargar el MCP; la skill habla en lenguaje conceptual.

## Anti-patterns a evitar

- Tickets que duplican el roadmap palabra por palabra.
- Tickets sin criterio de aceptación verificable ("mejorar X" sin decir cuándo está mejorado).
- Cierre de tickets sin commit/PR asociado (¿qué demuestra que está done?).
- Issues colgados en `In Progress` semanas sin movimiento — o se trabaja, o vuelve a `Todo`, o se documenta `blocked`.
- Crear ticket para todo lo que toca el teclado. La skill `commit-style` ya dice que cada commit explica el porqué; no duplicar esa explicación en un ticket si el work cabe en un commit.
- Cruzar contexto entre proyectos asumiendo que el MCP es global (es por-proyecto).
- **Inventar epics en Community.** No existen. Si necesitas agrupar trabajo bajo un paraguas, usa parent/sub-issues. Si te encuentras pidiéndole a Claude "crea un epic", reformula a "crea un work item paraguas con sub-issues".
- **Confundir module con jerarquía.** Un module agrupa por tema, no es padre de nada. Si dos work items tienen relación padre-hijo, va por `parent`, no por module compartido.
- **Forzar cycles cuando no hay compromiso temporal real.** Activarlos solo cuando vayas a comprometerte a una ventana de entrega; en proyectos personales sin deadline es ceremonia sin valor.
