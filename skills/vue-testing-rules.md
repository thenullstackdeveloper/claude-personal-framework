---
name: vue-testing-rules
description: Reglas de testing en Vue 3 + Vite (Vitest + @vue/test-utils + @pinia/testing + Playwright). Complementa `hexagonal-testing-strategy` (pirámide, fakes >> mocks, behavior over implementation) — esta skill concreta lo que cambia en Vue 3.
---

# Testing en Vue 3 + Vite

Esta skill se carga cuando el proyecto usa Vue 3 + Vitest. Asume la pirámide y las reglas genéricas de `hexagonal-testing-strategy`. Concreta el setup específico de Vue, los mocks canónicos de Router y Pinia, y las convenciones de Vitest.

Stack baseline: **Vitest 2+** + **`@vue/test-utils`** + **`@pinia/testing`** + **happy-dom** (rápido) o **jsdom** (más fiel). E2E con **Playwright**.

## Setup canónico

```bash
npm i -D vitest happy-dom @vue/test-utils @pinia/testing
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',  // alternativa: 'jsdom' (más fiel, más lento)
  },
})
```

`package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

`tsconfig.json` — añade `vitest/globals` a `types`:

```json
{ "compilerOptions": { "types": ["vitest/globals"] } }
```

## `@vue/test-utils` por default (no `@testing-library/vue`)

Las docs oficiales de Vue recomiendan **`@vue/test-utils`** como la librería por default para component testing. Razones:

- Mantenida por el core team de Vue.
- Más robusta para **async components y Suspense** — `@testing-library/vue` tiene issues documentados ahí.
- API de wrapper expresiva, cubre bien `props`, `emits`, `slots`.

`@testing-library/vue` es alternativa válida cuando prefieres su filosofía "test el DOM como el usuario" sobre la API de wrapper. Tradeoff: Suspense menos robusto y menos cobertura de la superficie de Vue.

**Criterio de esta skill**: `@vue/test-utils` por default; `@testing-library/vue` solo si el equipo viene de React Testing Library y quiere mantener el modelo mental.

## Mount vs shallowMount

`mount` renderiza componente + hijos. `shallowMount` stub-ea hijos.

```ts
import { mount, shallowMount } from '@vue/test-utils'

mount(MyComp, { props: { ... } })          // full render — default
shallowMount(MyComp, { props: { ... } })   // hijos como stubs
```

**Default: `mount`.** `shallowMount` solo cuando:

- El componente tiene hijos pesados (data fetchers, third-party widgets) y los quieres aislar.
- Quieres testar SOLO la composición / orquestación, no la integración con hijos reales.

Si tu suite es 90% `shallowMount`, falta integración real; probablemente estás testeando wiring en vez de behavior.

## Selectores y queries

Vue oficial recomienda **`data-testid`** como selector primary en components no triviales:

```vue
<template>
  <div data-testid="stepper-value">{{ value }}</div>
  <button data-testid="stepper-increment" @click="increment">+</button>
</template>
```

```ts
const wrapper = mount(Stepper)
expect(wrapper.find('[data-testid=stepper-value]').text()).toBe('0')
await wrapper.find('[data-testid=stepper-increment]').trigger('click')
expect(wrapper.find('[data-testid=stepper-value]').text()).toBe('1')
```

Razón: `data-testid` separa intención de test del markup. Cambias de `<div>` a `<span>`, los tests no se rompen. Pero los tests revelan qué partes son contractuales (lo testeado) vs cosméticas (lo demás).

**No abuses**. `data-testid` solo cuando no hay alternativa accesible. Si el button tiene un label clear (`Increment`), `wrapper.find('button[aria-label="Increment"]')` o `findByText('Increment')` (testing-library) es mejor.

## Behavior over implementation — DO / DON'T

**DO** — visual logic:

```ts
const wrapper = mount(Stepper, { props: { max: 1 } })
expect(wrapper.find('[data-testid=value]').text()).toContain('0')
```

**DO** — behavioral logic:

```ts
await wrapper.find('[data-testid=increment]').trigger('click')
expect(wrapper.find('[data-testid=value]').text()).toContain('1')
```

**DON'T** — privates:

```ts
// ❌ probando state interno
expect(wrapper.vm.count).toBe(1)

// ❌ probando método privado
wrapper.vm.privateIncrement()
```

Si refactorizas el componente sin cambiar el behavior visible, los tests no deberían romperse. Probar `wrapper.vm.X` te ata a la implementación.

**DON'T** — snapshots como default:

```ts
// ❌ snapshot del DOM completo — se rompe con cualquier cambio cosmético
expect(wrapper.html()).toMatchSnapshot()
```

Las docs oficiales lo desaconsejan. Reserva snapshots para output muy estable (configs serializados, copy estática) lejos del JSX/template.

## Async + reactivity — `nextTick`, `flushPromises`, fake timers

Después de un side effect que cambia state, **espera el siguiente tick** antes de asertar el DOM:

```ts
import { nextTick } from 'vue'

button.value++
await nextTick()
expect(wrapper.text()).toContain('1')
```

`trigger` ya hace flush implícito (devuelve promise). `await trigger('click')` cubre lo común.

Para promesas pending fuera del control de `trigger`, **`flushPromises`**:

```ts
import { flushPromises } from '@vue/test-utils'

// dispara fetch dentro del composable
trigger('click')
await flushPromises()
expect(wrapper.find('[data-testid=user]').text()).toBe('Angel')
```

**Fake timers** para flows con `setTimeout` / animaciones:

```ts
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('toast disappears after 5s', async () => {
  const wrapper = mount(Toast)
  expect(wrapper.text()).toBe('Saved')
  vi.advanceTimersByTime(5000)
  await nextTick()
  expect(wrapper.text()).toBe('')
})
```

## Vue Router en tests

Dos approaches según el caso:

### Router completo en memoria — para flows de navegación

```ts
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'

const routes = [
  { path: '/', component: { template: '<div>home</div>' } },
  { path: '/profile', component: Profile },
]

const router = createRouter({ history: createMemoryHistory(), routes })

test('navigates to profile', async () => {
  router.push('/')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  await router.push('/profile')
  expect(wrapper.text()).toContain('Profile')
})
```

`createMemoryHistory` evita tocar `window.location`. `await router.isReady()` antes de mount evita carrera en init.

### Mock parcial — cuando solo te interesa params/push

```ts
import { vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '42' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
```

Útil para tests de composables que dependen del router sin montar la app entera.

## Pinia en tests — `createTestingPinia`

`@pinia/testing` provee `createTestingPinia()` con dos features clave:

- `initialState` — overrides para state al instanciar.
- `stubActions` — controla qué acciones realmente se ejecutan.

### Para component tests

```ts
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { useCounterStore } from '@/stores/counter'
import Counter from '@/components/Counter.vue'

test('increments counter on click', async () => {
  const wrapper = mount(Counter, {
    global: {
      plugins: [createTestingPinia({
        initialState: { counter: { n: 5 } },
        // stubActions defaults to true — actions become jest.fn() / vi.fn()
      })],
    },
  })

  const store = useCounterStore()
  await wrapper.find('[data-testid=plus]').trigger('click')
  expect(store.increment).toHaveBeenCalledTimes(1)  // stub asserted
})
```

`stubActions` options:

| Valor | Efecto |
|---|---|
| `true` (default) | Todas las actions se stub-ean (no ejecutan; asertas que se llamaron). |
| `false` | Todas las actions se ejecutan normalmente. |
| `['increment', 'reset']` | Solo las nombradas se stub-ean. |
| `(actionName, store) => boolean` | Decisión condicional. |

### Override de getters en tests

Los getters son **writable solo en tests** con `createTestingPinia`:

```ts
const counter = useCounterStore()
counter.double = 999      // override
// ... aserciones ...
counter.double = undefined  // reset to computed behavior
```

### Para unit tests de stores directos

Sin montar componente:

```ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, test, expect } from 'vitest'
import { useCounterStore } from '@/stores/counter'

beforeEach(() => setActivePinia(createPinia()))

test('increment bumps n', () => {
  const store = useCounterStore()
  store.increment()
  expect(store.n).toBe(1)
})
```

### Plugins en tests — via options

```ts
createTestingPinia({ plugins: [persistedStatePlugin] })
```

NOT `.use()` después de la creación. Pasarlos como opción del testing pinia.

## Testing composables

### Composable simple (solo reactivity APIs)

Llamada directa, sin componente:

```ts
import { test, expect } from 'vitest'
import { useCounter } from '@/composables/use-counter'

test('useCounter', () => {
  const { count, increment } = useCounter()
  expect(count.value).toBe(0)
  increment()
  expect(count.value).toBe(1)
})
```

### Composable con lifecycle / provide-inject — `withSetup` helper

```ts
// test-utils/with-setup.ts
import { createApp } from 'vue'

export function withSetup<T>(composable: () => T): [T, App] {
  let result!: T
  const app = createApp({
    setup() {
      result = composable()
      return () => {}  // dummy render
    },
  })
  app.mount(document.createElement('div'))
  return [result, app]
}
```

```ts
import { withSetup } from '@/test-utils/with-setup'

test('useFoo with injected dep', () => {
  const [result, app] = withSetup(() => useFoo(123))
  app.provide(SomeKey, fakeAdapter)
  expect(result.foo.value).toBe(1)
  app.unmount()
})
```

`app.unmount()` siempre al final para limpiar el lifecycle.

## E2E — Playwright por default

Vue oficial **recomienda Playwright** sobre Cypress. Razones:

- Soporta Chromium, WebKit, Firefox (Cypress es Chromium-only por default).
- Mejor para eliminar tests flaky.
- Open source mantenido por Microsoft, sin features de pago.

Cypress sigue siendo válido por **debugging UI** y devx; algunas features (parallel runs en cloud) requieren subscription.

En greenfield 2026: **Playwright**. Migración existente desde Cypress: no urgente.

## Volume por capa en Vue 3

| Capa | Volume | Tooling |
|---|---|---|
| Domain / pure functions | **Muchos** | Vitest puro, sin mocks |
| Composables (application) | **Bastantes** | Vitest + `withSetup` helper si lifecycle |
| Stores Pinia | **Bastantes** | `setActivePinia(createPinia())` en `beforeEach` para tests directos |
| Components (presentation) | **Moderado** | `@vue/test-utils` + `mount`, `data-testid` |
| Screens / pages | **Pocos** | Router en memoria + `createTestingPinia` |
| E2E | **Mínimos, críticos** | Playwright — happy path + edge cases que han mordido |

Si el grueso de tu suite son tests de páginas con router y stores reales, falta refactorizar hacia composables + componentes puros (la skill `vue-hexagonal-patterns` aplica).

## Anti-patterns

- **`@testing-library/vue` con Suspense** o async components. Issue documentado; usar `@vue/test-utils` ahí.
- **`shallowMount` como default**. Pierdes integración; los tests pasan pero el wiring real puede romperse.
- **Snapshot del DOM completo** como aserción principal. Se rompe con cualquier cambio cosmético.
- **`wrapper.vm.X`** para asertar state interno. Probar el DOM (lo que ve el usuario).
- **`vi.mock('pinia')`** entero. Usa `createTestingPinia` — está hecho para esto.
- **Crear Pinia con `createPinia()`** en cada test sin `setActivePinia`. El store comparte instancia entre tests y filtra state.
- **Fake timers sin `nextTick`**. `vi.advanceTimersByTime` no flushea reactividad por sí solo.
- **Plugins de Pinia con `.use()`** en `createTestingPinia`. Pasarlos como opción.
- **E2E como sustituto de component tests**. La pirámide existe — Playwright no reemplaza Vitest.

## Referencias

- [Vue · Testing Guide](https://vuejs.org/guide/scaling-up/testing) — recomendaciones oficiales (Vitest + VTU + Playwright).
- [Vue Test Utils](https://test-utils.vuejs.org/) — API completa, mount/shallowMount, find/trigger.
- [Pinia · Testing](https://pinia.vuejs.org/cookbook/testing.html) — `createTestingPinia`, `initialState`, `stubActions`.
- [`createTestingPinia` API](https://pinia.vuejs.org/api/@pinia/testing/functions/createTestingPinia.html) — signatura completa.
- [Vue Router · Testing](https://test-utils.vuejs.org/guide/advanced/vue-router.html) — `createMemoryHistory` patterns.
- [Playwright](https://playwright.dev/) — E2E recomendado por Vue.
