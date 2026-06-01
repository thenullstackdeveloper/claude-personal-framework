---
name: react-hexagonal-patterns
description: Patrones específicos de hexagonal en frontend React — separación componentes/hooks/stores/adapters, custom hooks como application layer, composition root, effects discipline. Complementa `hexagonal-architect` y NO duplica reglas de TypeScript (`typescript-hexagonal-rules`), de Zustand (`zustand-patterns`), ni de testing (`hexagonal-testing-strategy`).
---

# Patrones hexagonales en frontend React

Esta skill se carga cuando el proyecto usa React. Concreta cómo se dibujan las capas hexagonales en una app React real. Asume hex aplicado (ver `hexagonal-architect`) y, si el proyecto usa Zustand, las reglas específicas viven en `zustand-patterns`.

Aviso: lo verdaderamente específico del frontend hex es relativamente poco. La mayoría de las decisiones tipadas viven en `typescript-hexagonal-rules`, la mayoría de las decisiones de state compartido en `zustand-patterns`. Esta skill se concentra en **cómo se dibuja la línea entre componentes, custom hooks, stores y adapters** — el spine del frontend hexagonal.

## Las cuatro capas del frontend hex

| Capa | Quién es | Responsabilidad |
|---|---|---|
| **Components** (presentation) | `*.tsx` en `components/` | JSX, props, eventos del DOM. Sin lógica de negocio. |
| **Custom hooks** (application) | `use*` en `hooks/` | Orquestan flows del usuario, componen selectors + acciones del store, exponen `{ state, actions }`. |
| **Stores** (state ports) | Zustand u otro | Fuente única de state compartido cross-cutting. El store ES el puerto. |
| **Adapters** (infrastructure) | `fetch` wrappers, `tauri::event::listen`, WebSocket clients, `localStorage` access | Hablan con el mundo exterior. Empujan/leen del store. |

**Dominio en frontend** (entidades, value objects, reglas puras) es **opcional**. Solo aplica si:

- Tienes lógica que se evalúa también en frontend (cálculos de precio, validación compleja de input).
- Esa lógica se reusa en varios sitios y duplicarla por componente cuesta.

Si tu app es mayormente "UI sobre datos de backend", el dominio frontend no aplica y no hay que inventarlo.

## Componentes — qué va y qué NO

**SÍ va en un componente:**

- JSX (estructura de la vista).
- Selectores simples del store (`useStore(s => s.user)`).
- Event handlers que delegan a acciones del store o a métodos del custom hook.
- Props de tipos primitivos o entidades del store.

**NO va en un componente:**

- Business rules (`if (user.role === 'admin' && !user.suspended && ...)` decidiendo qué renderizar). Eso pertenece a un custom hook (`useCanEdit(user)`) o a un selector derivado del store.
- Llamadas directas a APIs / Tauri / WebSocket. Eso es responsabilidad de adapters, invocados por custom hooks.
- `useEffect` con suscripciones externas que crecen con el componente. Ese acoplamiento al ciclo de vida del componente es síntoma de adapter ausente.
- `useState` para state que debería compartirse (otro componente o hook lo necesita). Si lo necesitas en dos sitios, va al store.

Heurística operativa: si el componente tiene >3 hooks (propios o de librería) o tiene `if/else` sobre datos del state, extrae custom hook.

## Custom hooks como application layer

**Naming**: `useVerbNoun` siguiendo la intención del usuario. `useInstallFlow`, `useStatusFlow`, `useUserProfile`. No `useUserService` (eso es OO style del backend, no traduce bien); el hook representa **un flujo**, no una clase.

**Forma del retorno**: típicamente uno de dos shapes según el caso:

- **Discriminated union** para flujos con outcome — `idle | loading | success | error`. Ejemplo: `useInstallFlow().outcome`.
- **Objeto plano** para flujos de lectura — `{ data, loading, error, refresh }`. Ejemplo: `useCatalog()`.

Una decisión consciente vs ambas mezcladas. Coherencia entre hooks del mismo proyecto reduce fricción.

**Reglas:**

- **Un flow por hook.** Si un hook hace install + status check + initialize, son tres hooks. La composición vive en el componente que los consume, no dentro de un mega-hook.
- **No renderiza JSX.** Si tu custom hook devuelve JSX, está mezclando capas. Convierte en componente.
- **No importa del DOM directamente** (`document.querySelector`, `window.location`). Si necesitas esto, abstráelo en un adapter o usa primitivas de React (`useRef`, `useNavigate`).
- **Testeable en aislamiento.** `renderHook` de RTL + mocks de los adapters. Si el test necesita montar React entero, el hook tiene demasiado.

**Cross-flow concerns**: cuando un flow necesita disparar otro tras éxito (típico: install → refresh status), expón un `onSuccess` callback opcional. El componente consumidor enchufa los flows. **No metas un hook compuesto** que orqueste dos flows — rompe la regla "un flow por hook" y mete acoplamiento donde antes no había.

## Stores como puertos

El store ES el puerto del frontend para state compartido. Componentes y custom hooks consumen via selectors. Adapters externos empujan via `setState`.

**Reglas independientes de la librería** (Zustand, Jotai, Valtio, Redux):

- **Un store por dominio funcional** salvo justificación clara. La cohesión accidental es peor que la duplicación temprana.
- **Componentes seleccionan; custom hooks orquestan.** Si un componente necesita combinar dos selectores, extrae custom hook.
- **El store no sabe quién lo lee.** Cero referencias a componentes específicos desde el store.

Para detalles específicos de Zustand v5 (`useShallow`, `subscribeWithSelector`, slices), ver `zustand-patterns`.

## Adapters externos al store

Adapters viven en `infrastructure/` o `adapters/` (o `lib/api.ts` en proyectos chicos). Responsabilidades:

- **Hablar con el mundo exterior**: `fetch`, `tauri::invoke`, `tauri::event::listen`, WebSocket, `localStorage`, etc.
- **Empujar al store** cuando reciben datos (push de un event, response de un fetch).
- **Devolver promesas tipadas** que los custom hooks consumen.

**Wiring canónico**:

```ts
// infrastructure/telemetry.ts — adapter, sin React
import { listen } from '@tauri-apps/api/event';
import { useTelemetryStore } from '@/stores/telemetry';

export async function startTelemetryAdapter() {
  return listen<TelemetryFrame>('telemetry', (event) => {
    useTelemetryStore.setState({ rpm: event.payload.rpm });
  });
  // returns the unlisten function
}
```

```tsx
// App.tsx — composition root
useEffect(() => {
  let cancel: (() => void) | null = null;
  startTelemetryAdapter().then((unlisten) => { cancel = unlisten; });
  return () => cancel?.();
}, []);
```

El componente raíz NO sabe nada de Tauri events. Solo arranca el adapter al montar y lo cancela al desmontar.

## Composition root

En una app React hexagonal, el composition root es **donde los adapters se conectan al store**. Tres patrones según el tamaño:

- **Pequeño / mediano**: un `useEffect` en `App.tsx` que llama a `startTelemetryAdapter()`, `startWebSocketAdapter()`, etc. Simple, todo en un sitio.
- **Crecimiento**: un módulo `setup/index.ts` que exporta `startAdapters()` y `stopAdapters()`. `App.tsx` solo llama a `startAdapters()` y al cleanup llama a `stopAdapters()`. Más limpio cuando hay >3 adapters.
- **Avanzado**: provider tree con contexts dedicados por adapter, cada uno gestionando su lifecycle. Útil cuando los adapters tienen state propio que NO encaja en el store global. Raro.

**No mezcles capas en el composition root**. Si necesitas leer del store para decidir qué adapter arrancar, **probablemente la decisión vive en un custom hook**, no en el composition root.

## Effects discipline

`useEffect` es un boundary: el componente está hablando con algo externo a React. Tres reglas:

- **Pocos efectos por componente** (1-2 max). Si tienes más, probablemente algunos pertenecen a custom hooks (encapsulados con su propia logic) o son síntoma de adapters mal definidos.
- **Sin cascadas de efectos**. Un effect que setea state que dispara otro effect que setea state... señal de que el flujo debería vivir en un custom hook con su propio reducer / derivación.
- **Cancelación siempre**. El return de un effect es para limpiar — suscripciones, timers, abort controllers. Olvidarlo es la fuente más común de memory leaks y comportamiento "raro" en hot-reload.

## Anti-patterns

- **Componentes con lógica de negocio embebida.** *"Mostrar este botón solo si el usuario es admin Y no está suspendido Y la cuota no expiró"*. Extrae a custom hook (`useCanEdit`) o a un selector derivado.
- **Cascadas de `useEffect`.** Effect A setea state → effect B reacciona → setea state → effect C reacciona. El flujo pertenece a un custom hook con `useReducer` o equivalente, no a la composición accidental de varios effects.
- **Stores acoplados a componentes**: el store tiene métodos como `selectUserForProfilePage(...)` o nombres que reflejan UI. El store no debe saber qué pantalla lo lee.
- **Custom hooks que renderizan JSX**. Si devuelves `<div>...</div>`, es componente. Cambia el naming y la firma.
- **`useState` para state cross-cutting.** Si dos componentes hermanos necesitan saber lo mismo, va al store. La "tentación de prop drilling" desde el padre es síntoma.
- **Adapters externos invocados desde componentes directamente** (`onClick={() => fetch(...)}`). El adapter va envuelto en un custom hook (`useInstallFlow().install()`) que el componente invoca.
- **Custom hook con varios flows mezclados** (`useEverything()` que hace login + fetch profile + save settings). Un flow por hook; la composición la hace el componente.
- **Provider trees gigantes**. Si tu `App.tsx` está envuelto en 8 providers, probablemente varios deberían ser stores en lugar de contexts. Context se justifica para cosas verdaderamente "tree-scoped" (theme, locale); el resto suele ser store.

## Referencias

- [Alex Kondov — Hexagonal-Inspired Architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/) — modelo conceptual que coincide con el de esta skill.
- [Martin Fowler — Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html) — separación de responsabilidades en React serias.
- [tkdodo — Zustand and React Context](https://tkdodo.eu/blog/zustand-and-react-context) — cuándo Context vs Store, decisión común mal resuelta.
- [Dimitri Dumont — Hexagonal Architecture in Frontend](https://www.dimitri-dumont.fr/en/blog/hexagonal-architecture-front-end) — visión complementaria, útil para discusión.
