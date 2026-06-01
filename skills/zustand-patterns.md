---
name: zustand-patterns
description: Patrones específicos de Zustand v5 en una app hexagonal — store como puerto del frontend, selectores y rendimiento, suscripciones externas con `subscribeWithSelector`, slices, middleware. Complementa `react-hexagonal-patterns`. NO duplica reglas de TypeScript generales (que viven en `typescript-hexagonal-rules`).
---

# Patrones Zustand v5 en arquitectura hexagonal

Esta skill se carga cuando el proyecto usa Zustand para state compartido. Concreta dónde encaja Zustand en el hex frontend y qué partes de su API se usan correctamente. Asume hex aplicado (ver `hexagonal-architect`) y patrones React generales (ver `react-hexagonal-patterns`).

## Dónde vive el store en el hex frontend

El store de Zustand es el **puerto del frontend para state compartido**. Tres tipos de consumidores se conectan a él, con responsabilidades distintas:

- **Componentes (presentation)** — leen state con `useStore(s => s.x)`. No conocen la fuente del state ni cómo se actualiza. Equivalente a "vista hexagonal pasiva".
- **Custom hooks (application layer)** — orquestan: leen + invocan acciones + componen valores derivados. Equivalente a casos de uso. Aquí vive la lógica de UI, no en componentes.
- **Adapters externos** (Tauri events, WebSocket, EventSource, polling) — empujan al store sin saber qué componentes leen. Suscripción canónica vía `subscribeWithSelector`.

La regla operativa: **lógica → custom hooks, lectura simple → componente, suscripción externa → adapter con `subscribeWithSelector`**. Si un componente tiene `if/else` sobre datos del store, falta un custom hook.

## Selectores — best practices

**Default: selector simple que lee state directo.**

```ts
const count = useStore((s) => s.count);
const user = useStore((s) => s.user);
```

Estos retornan primitivos o referencias ya estables (Zustand mantiene la identidad mientras el slice no cambie). No necesitan helper.

**`useShallow` solo cuando el selector construye una NUEVA estructura por call.**

```ts
// SÍ: el array es nuevo en cada render
const names = useStore(useShallow((s) => s.users.map((u) => u.name)));

// SÍ: el objeto es nuevo en cada render
const { name, email } = useStore(useShallow((s) => ({ name: s.name, email: s.email })));
```

Sin `useShallow` en estos casos, **Zustand v5 entra en infinite loop** por su default de `Object.is` en igualdad — la referencia cambia siempre, el componente re-renderiza, el selector vuelve a construir, y vuelta. Verificado contra la guía oficial de migración a v5 y la Discussion #2867 (maintainers).

**`useShallow` aplicado a state directo es redundante** (y a veces dañino):

```ts
// NO: estado directo. useShallow no añade nada.
const count = useStore(useShallow((s) => s.count));
```

**Regla derivada que repite tkdodo y los maintainers**: *"selectors simples en componentes, composición en custom hooks"*. Si el selector está creciendo, sácalo a un custom hook que combine varios selectors simples.

```ts
// Custom hook como application layer
function useUserSummary() {
  const name = useStore((s) => s.user.name);
  const email = useStore((s) => s.user.email);
  return { name, email };
}
```

## Suscripciones externas — `subscribeWithSelector`

Wiring canónico para conectar al store algo que no es React (Tauri events, WebSocket, EventSource, suscripciones a hardware/sensores):

```ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useTelemetry = create(
  subscribeWithSelector<TelemetryState>(() => ({
    rpm: 0,
    speed: 0,
  })),
);

// Adapter externo (vive en `infrastructure/`):
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen<TelemetryFrame>('telemetry', (event) => {
  useTelemetry.setState({ rpm: event.payload.rpm, speed: event.payload.speed });
});

// Suscripción Rust → componente, sin componente acoplado a Tauri:
useTelemetry.subscribe(
  (s) => s.rpm,
  (rpm, prevRpm) => {
    if (rpm > 8000 && prevRpm <= 8000) playRevWarning();
  },
);
```

Reglas:

- **Gating por `Object.is`** (default). Si tu selector construye una nueva referencia (`s => [s.rpm]`), dispara en cada update aunque el valor sea el mismo. Misma trampa que con `useShallow`: pasa `equalityFn` o usa selector simple.
- **El adapter no toca React**. `useTelemetry.subscribe(...)` y `useTelemetry.setState(...)` viven en código no-React (`infrastructure/telemetry.ts` o similar). Los componentes leen via `useTelemetry(s => s.rpm)` y no saben de Tauri.
- **Cancelación**: guarda el `unlisten` y la función devuelta por `subscribe`. El adapter debe exponer un `start()` / `stop()` que el composition root invoque (típicamente en un `useEffect` global del componente raíz o en una función de setup).

Verificado contra docs oficiales de `subscribeWithSelector` y la Discussion #1378 de pmndrs.

## Slices — patrón de respuesta al crecimiento

**Default: un store por dominio funcional.** tkdodo recomienda esto explícitamente: *"prefer multiple small stores over slices"*. Stores separados se componen mejor (cada uno tiene su propio middleware, su persistencia, sus suscripciones).

**Slices solo cuando un store crece** lo bastante para que la composición interna ayude más que la separación. Composición canónica oficial:

```ts
const useBoundStore = create<BearSlice & FishSlice>()((...a) => ({
  ...createBearSlice(...a),
  ...createFishSlice(...a),
}));
```

Cada `createSlice` recibe los argumentos `(set, get, store)` y devuelve su trozo del state. La composición es spread literal — sin `combineReducers`, sin orquestador.

**Regla dura sobre middleware en slices**: el middleware (`persist`, `devtools`, `subscribeWithSelector`) se aplica **una sola vez, a nivel del store combinado**. Verificado contra la doc oficial de slices, que explícitamente lo advierte:

> Adding middleware in slices is known to cause unexpected issues. Apply them at the combined store level instead.

Si tu slice "necesita" persist propio, probablemente debería ser un store independiente.

## Persistence middleware — gotchas

- **Schema versioning con `migrate`**: cuando cambies la forma del state guardado, incrementa `version` en la config de `persist` y define una función `migrate(persistedState, version)` que adapte estados viejos. Sin esto, usuarios con state cacheado de la versión anterior pueden ver crashes o estados inconsistentes.
- **`partialize` para no persistir todo**: por defecto `persist` guarda el state completo. Usa `partialize: (s) => ({ count: s.count })` para guardar solo lo que tiene sentido entre sesiones. Tokens / state efímero / cosas que se hidratan al arrancar **no van** a persist.
- **`onRehydrateStorage` para coordinar**: si dependes de que la hidratación termine antes de mostrar UI (auth, theme, locale), engánchate aquí. Sin esto, el primer render usa el initial state y luego "flickea" al hidratado.
- **Tauri-specific**: en una app Tauri sin SSR no aplican los problemas de hydration mismatch de SSR. Si el storage por defecto (`localStorage`) no encaja (por ej. quieres usar Tauri's Fs API), provee un `storage` custom.

## Anti-patterns

- **Store monolítico**: un único `useAppStore` con auth + UI state + telemetría + configuración. Crece, los selectors se vuelven indirectos, los re-renders se vuelven impredecibles. **Multiple small stores** o, si está justificado, slices con discipline.
- **Lógica de negocio en componentes**: `<TelemetryGauge>` que decide cuándo cambiar de color y cuándo emitir warnings es exactamente el tipo de cosa que va en un custom hook (`useGaugeColor`, `useRevWarning`). El componente solo recibe valores listos.
- **`useState` para estado que debería compartirse**: si dos componentes hermanos necesitan saber lo mismo y la única razón de tener `useState` es "lo pongo en el padre y lo paso como prop", suele ser candidato a store. Especialmente cuando son cross-cutting (theme, current page, telemetry stream).
- **`useShallow` aplicado a state directo**: ya cubierto arriba. Es ruido y a veces es bug.
- **Selectores que construyen new refs sin `useShallow` ni custom hook**: `useStore(s => [s.x, s.y])` re-renderiza en cada update aunque `x` e `y` no cambien. Sácalo a `useStore(useShallow(s => [s.x, s.y]))` o, mejor, a un custom hook que devuelva un objeto memoized.
- **Middleware en slices**: ya cubierto. Se aplica al store combinado.
- **Acciones dispersas por componentes** (`useStore.setState({...})` desde dentro de un `onClick`): centraliza acciones en el creator del store (`setUser: (u) => set({ user: u })`). Eso documenta qué muta state y desde dónde.
- **`subscribe` sin cancellation**: cada `subscribe` devuelve una función `unsubscribe`. Si no la guardas y la llamas al desmontar, el adapter sigue vivo. En Tauri, suscripciones huérfanas en hot-reload son una fuente común de comportamiento raro.

## Referencias

- [Zustand v5 migration guide](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5) — `useShallow`, strict equality default, infinite-loop cases.
- [pmndrs/zustand Discussion #2867](https://github.com/pmndrs/zustand/discussions/2867) — `useShallow` guidance from maintainers, selector composition rule.
- [Zustand — Slices pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern) — composición canónica, regla del middleware combinado.
- [Zustand — `subscribeWithSelector`](https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector) — middleware oficial para suscripciones externas.
- [tkdodo — Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) — "prefer multiple small stores", selectors-simple-in-components.
- [Tauri window state sync (gethopp.app)](https://www.gethopp.app/blog/tauri-window-state-sync) — patrón realista de wiring Zustand ↔ Tauri.
