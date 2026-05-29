---
name: typescript-hexagonal-rules
description: Reglas hexagonales específicas para proyectos TypeScript/Node. Complementa hexagonal-architect cuando trabajas en ese stack — manejo de tipos, errores, side effects y convenciones del lenguaje. Para la estrategia de testing por capa, ver `hexagonal-testing-strategy`.
---

# Reglas hexagonales para TypeScript / Node

Esta skill se carga junto con `hexagonal-architect` cuando el proyecto es TypeScript o Node. Concreta los principios universales en decisiones específicas del lenguaje.

Para la estrategia de testing por capa (pirámide hex, fakes vs mocks, anti-patterns, mappers con omisiones), ver la skill `hexagonal-testing-strategy` — agnóstica al lenguaje. Aquí solo lo verdaderamente específico de TypeScript / Node.

## TypeScript

- **TypeScript estricto** en todas las capas. Sin `any` ni `as` en dominio, salvo casos justificados con comentario.
- **Tipos discriminados** (unions con `kind: '...'`) para modelar resultados con varias formas. Hacen al compilador la barrera.
- **Readonly por defecto** en entidades y value objects: `readonly` en campos, `readonly T[]` en colecciones expuestas. La inmutabilidad es propiedad del dominio.
- **Branded types** para identificadores cuando hay ambigüedad (`AgentId` distinto de `string` aunque ambos sean strings en runtime). Evita pasar el id equivocado.

## Resultados que pueden fallar

- Prefiere `Result<T, E>` o tipos discriminados sobre `throw` en dominio. No es dogma, pero reduce sorpresas y obliga al caller a manejar el error.
- Si lanzas, lanza errores tipados que extienden de una clase base del dominio (`DomainError`). El caller puede usar `instanceof` para distinguir; los adapters de infraestructura los traducen a HTTP status, exit codes, eventos, etc.
- **Nunca lances strings ni objetos planos** desde el dominio. El tipo del error es parte del contrato.

## Side effects

- El dominio no ejecuta side effects. Los **modela como datos** (eventos de dominio devueltos por el método: `applyTo(x): { state: T; events: DomainEvent[] }`) o los **declara como comandos** que la aplicación ejecuta vía adapter.
- La aplicación recibe los efectos en formato de datos y decide cómo materializarlos (publicar evento, enviar email, escribir en BD). La aplicación no implementa los efectos — los delega al adapter inyectado.

## Convenciones del lenguaje que ayudan al hex

- **`import type`** para imports que solo se usan como tipos. Asegura que TypeScript no emite código para esos imports — útil para que el dominio no acabe accidentalmente importando un módulo runtime de infraestructura.
- **Path aliases** (`@domain/...`, `@application/...`, `@infrastructure/...`) cuando ayuden a hacer evidente la dirección de dependencia. Las violaciones se ven a simple vista en los imports.
- **ESLint / Biome rules**: si el linter tiene reglas de "no-restricted-imports", úsalas para prohibir imports de `@infrastructure/*` desde `@domain/*`. La barrera mecánica vale más que la disciplina manual.

## Anti-patterns frecuentes

- **Entidad como clase de TypeORM / Mongoose**: la entidad lleva decoradores ORM, está acoplada al schema de la tabla y al adapter. Pierde portabilidad y los tests del dominio requieren mock del ORM. Solución: entidad pura + entidad de persistencia separada + mapper.
- **Use case que devuelve el objeto del adapter**: el caso de uso recibe el DTO interno del adapter y lo devuelve sin mapear. El DTO se filtra al consumer. Solución: use case devuelve entidad o un tipo de salida explícito; el adapter HTTP traduce a su DTO al borde.
- **`unknown` en lugar de tipos discriminados** para "puede ser una cosa o la otra". `unknown` empuja la decisión al runtime. Solución: union types con `kind`.
- **`Promise<void>` ocultando un side effect en dominio**: si una función pura devuelve `Promise<void>`, sospecha. El dominio no debería devolver promises; las funciones puras son síncronas. Si necesita asincronía, está en la capa equivocada.
