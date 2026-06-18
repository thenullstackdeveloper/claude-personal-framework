---
name: pinia-patterns
description: Patrones específicos de Pinia v3 en una app hexagonal Vue 3 — store como puerto, setup-style vs options-style, storeToRefs, $subscribe / $onAction, plugins, composing stores. Complementa `vue-hexagonal-patterns`. NO duplica reglas de TypeScript generales (que viven en `typescript-hexagonal-rules`).
---

# Patrones Pinia v3

Esta skill se carga cuando el proyecto usa Pinia (Vue 3, default state manager desde 2022). Asume las cuatro capas del frontend Vue hex (ver `vue-hexagonal-patterns`) y se concentra en cómo escribir y consumir stores Pinia idiomáticos.

Baseline: **Pinia v3**, **`<script setup>`** en components, **TypeScript estricto**.

## Setup-style por default

Pinia oficialmente NO mandata setup-style ni options-style — son ambos válidos. Las docs lo framean como preferencia personal:

> Option Stores are easier to work with while Setup Stores are more flexible and powerful.

**Criterio editorial de esta skill: setup-style por default.** Razones:

- Consistencia con `<script setup>` en components. El mismo modelo mental.
- Composición de stores leyendo otros stores se expresa con `useStore()` al top, igual que en composables.
- Tipos genéricos y refinamientos de TS funcionan mejor.
- Composables externos (e.g., VueUse) se integran de forma natural.

Options-style sigue siendo válido cuando el equipo viene de Options API en components o cuando el store es genuinamente CRUD declarativo (state/getters/actions claros, cero composición).

```ts
// stores/counter.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  // state — refs
  const n = ref(0)

  // getters — computed
  const double = computed(() => n.value * 2)

  // actions — functions
  function increment(by = 1) {
    n.value += by
  }
  function reset() {
    n.value = 0
  }

  // REQUIRED: return all state to be registered
  return { n, double, increment, reset }
})
```

### Mapping setup-style canónico

| Concepto | En setup-style |
|---|---|
| `state` | `ref()` |
| `getters` | `computed()` |
| `actions` | `function` (sync o async) |

### CRÍTICO: devuelve TODO el state

> You must return all state properties in setup stores for Pinia to pick them up as state. Not returning all state properties or making them readonly will break SSR, devtools, and other plugins.

No hay state "privado" en setup stores. Si no quieres exponerlo, no lo metas en el store. Si lo metes, devuélvelo.

```ts
// ❌ state privado — rompe devtools, SSR, plugins
export const useFoo = defineStore('foo', () => {
  const _internal = ref(0)
  const public = ref(0)
  function bump() { _internal.value++; public.value = _internal.value * 2 }
  return { public, bump }  // _internal NO devuelto → invisible para Pinia
})

// ✅ todo expuesto, prefijo convencional para señalizar "interno"
export const useFoo = defineStore('foo', () => {
  const counter = ref(0)
  const display = ref(0)
  function bump() { counter.value++; display.value = counter.value * 2 }
  return { counter, display, bump }
})
```

Si necesitas state genuinamente local que no debería compartir, usa un composable, no un store.

## Destructurar — `storeToRefs` es obligatorio

Destructurar un store directamente **rompe la reactividad** de state y getters:

```ts
const store = useCounterStore()

// ❌ n es un number suelto, double es un number suelto
const { n, double } = store

// ✅ refs preservados
const { n, double } = storeToRefs(store)
```

`storeToRefs()` extrae **state + getters + plugin-added state** como refs. Métodos y propiedades no-reactivas las ignora.

**Las acciones se destructuran directo** del store — son funciones, no necesitan ref:

```ts
const store = useCounterStore()
const { n, double } = storeToRefs(store)     // state + getters
const { increment, reset } = store            // actions
```

Patrón canónico completo en un componente:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCounterStore } from '@/stores/counter'

const counter = useCounterStore()
const { n, double } = storeToRefs(counter)
const { increment, reset } = counter
</script>

<template>
  <p>n = {{ n }}, double = {{ double }}</p>
  <button @click="increment()">+1</button>
  <button @click="reset()">reset</button>
</template>
```

## Actions — async, error handling

Las acciones pueden ser async. Pinia las trackea para devtools, `$onAction` y testing.

```ts
export const useUserStore = defineStore('user', () => {
  const current = ref<User | null>(null)
  const error = ref<Error | null>(null)
  const loading = ref(false)

  async function load(id: string) {
    loading.value = true
    error.value = null
    try {
      current.value = await api.fetchUser(id)
    } catch (e) {
      error.value = e as Error
      throw e   // re-throw para que callers decidan
    } finally {
      loading.value = false
    }
  }

  return { current, error, loading, load }
})
```

Reglas:

- **Acciones lanzan o devuelven Result**, no ambas inconsistentemente. Decide en el store y mantén el shape.
- **No metas lógica de UI en actions** (`toast.show(...)`, `router.push(...)`). El UI/router vive en el component o el composable que llama a la action.
- **Trim del state durante errores**. Si el fetch falla, decide explícitamente: ¿el state anterior queda o se limpia? Documéntalo.

### `$patch` y `$reset`

`$patch` es para mutaciones múltiples atómicas (un solo trigger de reactividad):

```ts
// ❌ dos triggers
counter.n = 5
counter.double  // se recomputa de nuevo

// ✅ un trigger
counter.$patch({ n: 5, label: 'updated' })

// ✅ función para mutaciones complejas (arrays push, splice)
counter.$patch((state) => {
  state.items.push(newItem)
  state.lastUpdated = Date.now()
})
```

`$reset` solo funciona en **options-style** (Pinia sabe el state inicial desde la option). En setup-style no existe automáticamente — escríbelo:

```ts
function $reset() {
  n.value = 0
  current.value = null
}
return { ..., $reset }
```

## Composing stores

Llamar `useStore()` al **top del setup function** del store que compone:

```ts
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from './auth'

export const useDashboardStore = defineStore('dashboard', () => {
  const auth = useAuthStore()                            // ← top del setup
  const greeting = computed(() => `Hi ${auth.user?.name ?? 'guest'}`)

  return { greeting }
})
```

**Caveat**: si dos stores se componen leyendo state del otro en el body del setup (no en computed/actions), puede causar problemas de init order. Patrón seguro: lee state del otro store DENTRO de computed o actions, no como variable suelta del body.

```ts
// ⚠️ frágil si useB también compone useA
const a = useA()
const x = a.state                                        // body — orden importa

// ✅ seguro — evaluado lazy
const a = useA()
const x = computed(() => a.state)                        // computed — orden no importa
```

## Cross-cutting concerns — `$subscribe`, `$onAction`, plugins

`$subscribe(cb)` reacciona a **cambios de state**. `$onAction(cb)` reacciona a **invocaciones de actions** (con before / after / onError). Habilitan analytics, debug, persistence sin acoplar el store a esas concerns.

### Persistence con `$subscribe`

```ts
const counter = useCounterStore()
counter.$subscribe((mutation, state) => {
  localStorage.setItem('counter', JSON.stringify(state))
})
```

Para casos comunes, **`pinia-plugin-persistedstate`** ya implementa esto con opciones de storage, paths a persistir, etc. Es el ejemplo canónico de plugin Pinia.

### Plugins — registro centralizado

Los plugins se registran via `pinia.use(plugin)` y reciben `{ pinia, app, store, options }`. **Solo afectan stores creados después del registro**.

```ts
// plugins/persisted.ts
import type { PiniaPluginContext } from 'pinia'

export function persistedStatePlugin({ store }: PiniaPluginContext) {
  const key = `pinia-${store.$id}`
  const saved = localStorage.getItem(key)
  if (saved) store.$patch(JSON.parse(saved))
  store.$subscribe((_, state) => {
    localStorage.setItem(key, JSON.stringify(state))
  })
}
```

```ts
// main.ts
import { createPinia } from 'pinia'
import { persistedStatePlugin } from './plugins/persisted'

const pinia = createPinia()
pinia.use(persistedStatePlugin)
app.use(pinia)
```

Capacidades documentadas:

- **Añadir state/properties** al store (`store.$state.newField = ...`).
- **Wrap existing methods** para inyectar logging / metrics.
- **Interceptar acciones y resultados** con `$onAction`.
- **Side effects** como persistence, sync con WebSocket.

### `$onAction` — auditoría / logging

```ts
counter.$onAction(({ name, args, after, onError }) => {
  const start = Date.now()
  after((result) => {
    console.log(`${name}(${args}) took ${Date.now() - start}ms`, result)
  })
  onError((err) => {
    console.error(`${name} threw`, err)
  })
})
```

Útil para tracking errores en runtime sin envolver cada action manualmente.

## Anti-patterns

- **Destructurar el store sin `storeToRefs`**. State y getters pierden reactividad. Las actions sí se destructuran directo.
- **State privado en setup stores** (variable no devuelta). Rompe SSR, devtools, plugins. Si necesitas privado, usa un composable.
- **Stores monolíticos** que mezclan dominios (`useAppStore` con auth + cart + ui). Un store por dominio funcional. La cohesión accidental es peor que la duplicación temprana.
- **Lógica de UI en actions** (`toast.show`, `router.push`, `dialog.open`). El UI/routing pertenece al component o composable que llama a la action.
- **Getters con side effects**. `computed` debe ser puro. Si necesitas un side effect cuando cambia un valor, usa `watch` o `$subscribe`.
- **Mutar state directamente desde components** (`store.n = 5` salido de cualquier sitio). Si pasa más de una vez, hace falta una action que encapsule la mutación con su intención.
- **`Reactivity Transform` (`$ref`, etc.)** dentro de stores. Removido en Vue 3.4 / @vitejs/plugin-vue 5.0+.
- **`$reset` esperado en setup-style** sin escribirlo. No existe automáticamente; impleméntalo si lo necesitas.
- **Plugins registrados tarde**, después de crear stores. Los stores ya existentes no los reciben.
- **Composing stores leyendo state en el body del setup** cuando hay riesgo de circularidad. Lee dentro de `computed` / actions.

## Referencias

- [Pinia · Core Concepts](https://pinia.vuejs.org/core-concepts/) — setup vs options, mapping, "must return all state".
- [Pinia · `storeToRefs`](https://pinia.vuejs.org/api/pinia/functions/storeToRefs.html) — extrae state + getters preservando reactividad.
- [Pinia · State](https://pinia.vuejs.org/core-concepts/state.html) — `$patch`, `$reset`, persistence con `$subscribe`.
- [Pinia · Actions](https://pinia.vuejs.org/core-concepts/actions.html) — async, `$onAction` para tracking.
- [Pinia · Plugins](https://pinia.vuejs.org/core-concepts/plugins.html) — `pinia.use()`, context, capabilities.
- [Pinia · Composing Stores](https://pinia.vuejs.org/cookbook/composing-stores.html) — `useStore()` al top del setup, caveat de lectura en body vs computed.
- [pinia-plugin-persistedstate](https://prazdevs.github.io/pinia-plugin-persistedstate/) — el plugin canónico de persistence.
