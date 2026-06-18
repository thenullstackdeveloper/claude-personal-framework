---
name: vue-hexagonal-patterns
description: Patrones de hexagonal en frontend Vue 3 + Vite SPA — separación SFC/composables/stores/adapters, Composition API + `<script setup>`, reactivity discipline (ref vs reactive, shallowRef, watch), composables como application layer, Vue Router 4 como adapter, provide/inject como ports tipados, composition root en main.ts. Complementa `hexagonal-architect` y NO duplica `typescript-hexagonal-rules`, `pinia-patterns`, ni `hexagonal-testing-strategy`.
---

# Patrones hexagonales en frontend Vue 3

Esta skill se carga cuando el proyecto usa Vue 3 + Vite SPA. Asume hex aplicado (ver `hexagonal-architect`), reglas TS en `typescript-hexagonal-rules`, stores Pinia en `pinia-patterns` y testing pyramid en `hexagonal-testing-strategy`. Se concentra en cómo se dibujan las capas hexagonales en una app Vue real.

Baseline: **Vue 3.5+** (para destructuring reactivo de `defineProps`), **`<script setup>`** como default, **Vue Router 4.4+**, **TypeScript estricto**. SSR/Nuxt está intencionalmente out of scope — esta skill cubre SPA pura.

## Las cuatro capas del frontend Vue hex

| Capa | Quién es | Responsabilidad |
|---|---|---|
| **Components** (presentation) | `.vue` SFC con `<script setup>` | Template, props, eventos del DOM. Sin lógica de negocio. |
| **Composables** (application) | `use*` en `composables/` | Orquestan flows del usuario, componen stores + adapters, exponen objeto plano de refs. |
| **Stores** (state ports) | Pinia (ver `pinia-patterns`) | Fuente única de state compartido cross-cutting. El store ES el puerto. |
| **Adapters** (infrastructure) | `fetch` wrappers, WebSocket clients, `localStorage`, Vue Router | Hablan con el mundo exterior. Empujan/leen del store. |

**Dominio en frontend** (entidades, value objects, reglas puras) es **opcional**. Solo aplica si tienes lógica que se evalúa también en frontend (cálculos, validación compleja) reusada en varios sitios. Si tu app es "UI sobre datos de backend", no inventes un dominio frontend.

## `<script setup>` como default

`<script setup>` es la **sintaxis recomendada oficialmente** en Vue 3.5+. Ventajas concretas vs `<script>` con `setup()` function:

- Menos boilerplate. Las top-level bindings se exponen automáticamente al template.
- `defineProps` / `defineEmits` / `defineModel` con TypeScript puro.
- Mejor runtime perf (template compilado en el mismo scope, sin proxy intermedio).
- Mejor IDE type-inference perf.

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const { count = 0 } = defineProps<{ count?: number }>()  // 3.5+ keeps reactivity
const emit = defineEmits<{ increment: [by: number] }>()
const model = defineModel<string>()  // two-way binding from parent v-model

const double = computed(() => count * 2)
</script>

<template>
  <button @click="emit('increment', 1)">{{ double }}</button>
  <input v-model="model" />
</template>
```

Los macros (`defineProps`, `defineEmits`, `defineModel`, `defineSlots`) son **compile-time**: no se importan, no existen en runtime. Funcionan solo dentro de `<script setup>`.

### Destructuring reactivo de props (Vue 3.5+)

```ts
const { foo } = defineProps(['foo'])
watchEffect(() => console.log(foo))
// Vue 3.5+: re-runs when foo changes (the compiler rewrites `foo` to `props.foo`)
// Vue 3.4 y antes: runs only once, foo is a static local
```

**Baseline mínima recomendada: Vue 3.5+** para evitar este pie en el suelo. Si el proyecto está en 3.4 o antes, documentar que el destructuring de props pierde reactividad y usar `props.foo` en su lugar.

## Reactivity discipline

### `ref()` es la primaria, NO `reactive()`

Vue recomienda oficialmente `ref()` como API primaria. `reactive()` tiene tres limitaciones que motivan la recomendación:

1. **NO acepta primitivos** (string, number, boolean). Solo objects / arrays / Map / Set.
2. **Reasignar la variable rompe la conexión reactiva** (`obj = newObj` deja el `obj` original intacto en consumers).
3. **Destructurar propiedades primitivas pierde reactividad**.

```ts
// ❌ pierde reactividad al destructurar
const state = reactive({ count: 0, name: 'Angel' })
const { count } = state              // count es un number suelto, no reactivo
function increment() { state.count++ }
// el component que ya destructuró sigue viendo el viejo count

// ✅ ref + .value
const count = ref(0)
const name = ref('Angel')
function increment() { count.value++ }
```

Excepción: `reactive()` sigue siendo útil para grupos de refs que viajan juntos (form state) cuando NO se va a destructurar. Pero el default es `ref()`.

### `shallowRef` para objetos grandes / external state

Cuando se asigna un objeto al `.value` de un `ref` normal, Vue lo hace **deeply reactive** via `reactive()`. Para objetos grandes (100k+ propiedades) o cuando el estado interno lo gestiona una librería externa (Three.js scene, D3 selection), eso es overhead innecesario.

```ts
import { shallowRef, triggerRef } from 'vue'

const scene = shallowRef<Scene>(new Scene())
// solo .value se trackea; mutaciones internas (scene.value.add(...)) NO disparan reactividad
// fuerza update manual cuando lo necesites:
scene.value.add(mesh)
triggerRef(scene)
```

### `computed` vs `watch` vs `watchEffect`

| API | Cuándo |
|---|---|
| `computed` | Valor derivado de otros refs/reactives. Cacheado. Sin side effects. |
| `watch` | Reaccionar a un source específico con `oldValue` + `newValue`. Lazy por defecto. |
| `watchEffect` | Reaccionar a CUALQUIER ref leído en su body. Tracking automático. Eager. |

Regla: si vas a derivar un valor, **`computed`**. Si vas a disparar un side effect cuando A cambie, **`watch`**. `watchEffect` es elegante pero engaña — captura todo lo que lee y dispara con cada cambio. Útil para "haz X cuando cualquiera de estas cosas cambie y no me importa el detalle".

### Regla CRÍTICA: `watch()` necesita getter para reactive properties / props

```ts
// ❌ pasa un número estático, watch NO reacciona
watch(props.count, () => { ... })
watch(obj.count, () => { ... })

// ✅ getter function
watch(() => props.count, () => { ... })
watch(() => obj.count, () => { ... })

// ✅ ref directo (es un Ref<T>, no un valor)
watch(myRef, () => { ... })
```

`watch()` acepta como source: `Ref<T>`, `() => T`, o un reactive object completo. Si pasas `obj.count`, eso ya se evaluó a un primitivo en el momento de la llamada — no hay nada que observar.

### Reactivity Transform ELIMINADA

`$ref`, `$()` y otros macros de Reactivity Transform fueron oficialmente **eliminados de Vue core en 3.4** (RFC #369 marcado "Dropped"). Sobreviven solo en el plugin community Vue Macros. En greenfield, NO usar.

## Composables como application layer

Tres convenciones oficiales:

1. **Naming camelCase con prefijo `use`**: `useFetch`, `useUserProfile`, `useStatusFlow`.
2. **Retornan objeto plano de refs** — NO un `reactive()`. Permite destructurar preservando reactividad.
3. **Si aceptan inputs reactivos, usar `toValue()`** (Vue 3.3+) para normalizar `ref | () => T | T`.

```ts
import { ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

export function useFetch<T>(url: MaybeRefOrGetter<string>) {
  const data = ref<T | null>(null)
  const error = ref<Error | null>(null)
  const loading = ref(false)

  watchEffect(async () => {
    loading.value = true
    try {
      const res = await fetch(toValue(url))
      data.value = await res.json()
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  })

  return { data, error, loading }  // objeto plano de refs
}
```

Consumir:

```vue
<script setup lang="ts">
const userId = ref('1')
const url = computed(() => `/api/users/${userId.value}`)
const { data, loading, error } = useFetch<User>(url)  // destructure ok
</script>
```

Reglas adicionales:

- **Un flow por composable.** Si `useUser` hace fetch + save + delete, son tres composables.
- **NO renderiza template.** Si tu composable devuelve JSX/h(), es componente.
- **NO importa del DOM directamente.** Si necesitas `document.querySelector`, abstráelo en un adapter.
- **Testeable en aislamiento.** Sin DOM-dependent composables → `withSetup` helper (ver `vue-testing-rules`).

### `useRoute` / `useRouter` van en composables, no en components

Anti-pattern: usar `useRoute()` directamente en un component para tomar un param y orquestar fetch.

```vue
<!-- ❌ component sabe de routing -->
<script setup lang="ts">
const route = useRoute()
const { data } = useFetch(`/api/users/${route.params.id}`)
</script>

<!-- ✅ component recibe lo resuelto -->
<script setup lang="ts">
const { user, loading } = useUserDetailFlow()
</script>
```

```ts
// composables/use-user-detail-flow.ts
import { computed } from 'vue'
import { useRoute } from 'vue-router'

export function useUserDetailFlow() {
  const route = useRoute()
  const id = computed(() => route.params.id as string)
  const { data: user, loading } = useFetch<User>(() => `/api/users/${id.value}`)
  return { user, loading }
}
```

### Watch del route — propiedad concreta, no el objeto entero

```ts
// ❌ watch entire route triggers on hash, query, every nav
watch(route, () => { ... })

// ✅ specific property
watch(() => route.params.id, async (newId) => {
  user.value = await fetchUser(newId as string)
})
```

## Provide / inject como puertos tipados

`provide` / `inject` es el mecanismo de Vue para inyección de dependencia tree-scoped. Útil como **puerto** cuando:

- El valor lo consume un subset del árbol (no global → no merece Pinia store).
- El valor varía por subtree (theme local, layout context).
- Quieres testear el component mockeando el inject sin tocar el store global.

**Siempre tipado con `InjectionKey<T>`**:

```ts
// ports/auth-key.ts
import type { InjectionKey } from 'vue'

export interface AuthPort {
  user: Ref<User | null>
  login(creds: Credentials): Promise<void>
  logout(): Promise<void>
}

export const AuthKey: InjectionKey<AuthPort> = Symbol('AuthPort')
```

```ts
// main.ts (composition root)
import { createApp } from 'vue'
import { AuthKey } from './ports/auth-key'
import { createAuthAdapter } from './adapters/auth'

const app = createApp(App)
const auth = createAuthAdapter()
app.provide(AuthKey, auth)
```

```vue
<!-- consume -->
<script setup lang="ts">
import { inject } from 'vue'
import { AuthKey } from '@/ports/auth-key'

const auth = inject(AuthKey)
if (!auth) throw new Error('AuthKey not provided')
</script>
```

**Decisión: provide/inject vs Pinia store**

| Criterio | provide/inject | Pinia store |
|---|---|---|
| Scope | Tree-scoped (un subtree) | Global |
| Devtools | No | Sí |
| SSR | OK (per-request scope con `createApp`) | OK con `createPinia` per request |
| Variabilidad por subtree | Sí (provide distinto en cada parent) | No (single instance) |
| Default elección | Cuando el state varía por subtree o es muy local | Cuando el state es app-global |

Si el state es global, default a Pinia. provide/inject brilla para puertos donde el adapter concreto puede variar (testing, multi-tenant) o el scope es tree-local.

## Adapters externos

Adapters viven en `infrastructure/` o `adapters/`. Responsabilidades:

- **Hablar con el mundo exterior**: `fetch`, WebSocket, `localStorage`, `IndexedDB`, navigator APIs.
- **Empujar al store** cuando reciben datos (push de event, response de fetch).
- **Devolver promesas tipadas** que los composables consumen.

```ts
// adapters/telemetry.ts — sin Vue
import { useTelemetryStore } from '@/stores/telemetry'

export function createTelemetryAdapter() {
  const store = useTelemetryStore()
  const ws = new WebSocket(import.meta.env.VITE_TELEMETRY_URL)
  ws.addEventListener('message', (e) => {
    store.push(JSON.parse(e.data))
  })
  return { stop: () => ws.close() }
}
```

```ts
// main.ts (composition root)
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createTelemetryAdapter } from './adapters/telemetry'

const app = createApp(App)
app.use(createPinia())
app.use(router)

app.mount('#app')

// adapters después del mount para que Pinia esté inicializado
const telemetry = createTelemetryAdapter()
// telemetry.stop() en hot reload o teardown
```

## Composition root — `main.ts`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { AuthKey } from './ports/auth-key'
import { createAuthAdapter } from './adapters/auth'

const app = createApp(App)

app.use(createPinia())  // FIRST — stores need Pinia ready
app.use(router)

// Ports (provide/inject)
const auth = createAuthAdapter()
app.provide(AuthKey, auth)

app.mount('#app')

// Background adapters (after mount)
// const telemetry = createTelemetryAdapter()
```

Orden: Pinia → Router → provides → mount → adapters background.

### Vue Router 4 — guards en composition

Tres niveles: global (`beforeEach`), per-route (`beforeEnter`), in-component (`onBeforeRouteUpdate` / `onBeforeRouteLeave`).

**Auth guard canónico**:

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()  // funciona en guards (Vue 3.3+ inject)
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
})

export default router
```

Reglas:

- **`beforeEach` async/await OK.** El navigation espera.
- **Return**: `false` cancela, route object redirige, nada/`true` prosigue.
- **NO meter auth check en cada componente** con `useEffect`-style. El guard es el sitio.
- **In-component guards en setup**:

```vue
<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'

const hasUnsavedChanges = ref(false)
onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges.value) {
    return confirm('Discard changes?')
  }
})
</script>
```

### Typed routes — built-in (4.4+) vs `unplugin-vue-router`

Vue Router 4.4+ trae soporte nativo via `RouteRecordInfo`. Las docs lo describen como "tedious and error-prone" en setup manual y **recomiendan explícitamente** el plugin `unplugin-vue-router` (file-based routing + auto-generación de tipos).

En greenfield: **default a `unplugin-vue-router`**. El built-in typed-routes es para casos donde no quieres el plugin (proyecto pequeño o restricciones de tooling).

## Anti-patterns

- **`reactive()` con primitivos**. `reactive(0)` lanza warning y no funciona. Usa `ref(0)`.
- **Destructurar `reactive()` esperando reactividad.** `const { count } = reactive({ count })` te da un `number` suelto. Si tienes que destructurar, refactoriza a refs.
- **`watch` sobre props/reactive sin getter**: `watch(props.x, ...)` no observa. Usa `watch(() => props.x, ...)`.
- **`watch(route, ...)`** entero. Casi siempre lo que quieres es `watch(() => route.params.id, ...)`.
- **`reactive()` en composables**. Retorna objeto plano de refs (perder reactividad al destructurar es lo más reportado).
- **Lógica de negocio en components**. Si el `<script setup>` tiene >50 líneas de lógica con `if/else` sobre el state, extrae composable.
- **Composables que renderizan template**. Es componente, no composable. Renombra y cambia firma.
- **`useRoute()` / `useRouter()` en components** cuando hay composables. El componente recibe lo resuelto.
- **`useEffect`-style auth check** en cada componente. El sitio es el navigation guard.
- **`Reactivity Transform` (`$ref`, `$()`)** en greenfield. Removido en 3.4. No existe.
- **Adapters importados directamente en components**. El adapter va envuelto en composable o llamado desde `main.ts`.
- **Mega `setup()` function en vez de `<script setup>`** sin razón. La razón legítima es cuando necesitas `expose` selectivo o options-API mix; sin esos, `<script setup>`.

## Referencias

- [Vue · `<script setup>`](https://vuejs.org/api/sfc-script-setup.html) — sintaxis recomendada, macros, ventajas.
- [Vue · Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html) — `ref` vs `reactive`, limitaciones de `reactive()`.
- [Vue · Composables](https://vuejs.org/guide/reusability/composables.html) — naming, return shape, `toValue()`.
- [Vue · Performance · shallowRef](https://vuejs.org/guide/best-practices/performance.html) — escape hatch.
- [Vue · Provide / Inject](https://vuejs.org/guide/components/provide-inject) — `InjectionKey<T>` tipado.
- [Vue Router · Composition API](https://router.vuejs.org/guide/advanced/composition-api.html) — `useRoute` / `useRouter`, in-component guards.
- [Vue Router · Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html) — global / per-route / in-component, async.
- [Vue Router · Typed Routes](https://router.vuejs.org/guide/advanced/typed-routes) — built-in 4.4+ y recomendación `unplugin-vue-router`.
- [RFC #369 · Reactivity Transform Dropped](https://github.com/vuejs/rfcs/discussions/369) — por qué no usar `$ref`.
- [VueUse · Best Practice](https://vueuse.org/guide/best-practice) — convenciones para composables reutilizables.
