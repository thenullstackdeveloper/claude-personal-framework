---
name: react-native-testing-rules
description: Reglas de testing en RN + Expo (jest-expo + React Native Testing Library + expo-router/testing-library, mocks de native modules, e2e con Maestro). Complementa `hexagonal-testing-strategy` (pirámide, fakes >> mocks, behavior over implementation) — esta skill concreta lo que cambia en RN-Expo.
---

# Testing en React Native + Expo

Esta skill se carga cuando el proyecto usa RN + Expo. Asume la pirámide y las reglas genéricas de `hexagonal-testing-strategy` (volume por capa, behavior over implementation, fakes >> mocks). Concreta el setup de Jest específico de Expo, los mocks de módulos nativos, y los patrones de Expo Router en tests.

Baseline: **`jest-expo` preset** + **React Native Testing Library** (RNTL) + **`expo-router/testing-library`** para pantallas con routing. E2E con **Maestro** por defecto en 2026.

## Setup canónico

`package.json`:

```json
{
  "jest": {
    "preset": "jest-expo"
  },
  "scripts": {
    "test": "jest --watch"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["jest"]
  }
}
```

Lo que el preset `jest-expo` hace por ti:

- Auto-mockea la **parte nativa** del Expo SDK — no necesitas `jest.mock` para `expo-image`, `expo-secure-store`, `expo-notifications`, etc.
- Configura `transformIgnorePatterns` para los paquetes RN/Expo que necesitan transpilación.
- Resuelve la convención de naming: `**.test.ts(x)` y carpetas `__tests__/`.

Si usas **pnpm** el regex de `transformIgnorePatterns` cambia (estructura `.pnpm/`). Override en la sección `jest` del `package.json` si los tests fallan con "SyntaxError: Unexpected token 'export'" al importar un paquete RN.

## Estructura y naming

- Carpetas `__tests__/` colocadas junto al código que testean, o un `__tests__/` raíz para integración. Las dos conviven.
- Naming: `Component.test.tsx`, `useFlow.test.ts`, `port.test.ts`.
- **NO meter tests dentro de `app/`** (Expo Router). Todos los archivos en `app/` deben ser rutas o layouts. Cualquier `app/whatever.test.tsx` será interpretado como una ruta y romperá el routing. Usar `__tests__/` paralelo.

## Queries RNTL — orden de preferencia

```
getByRole       ← accesible, refleja la API real al usuario
getByLabelText  ← labels asociados (inputs)
getByText       ← contenido visible
getByPlaceholderText
getByTestId     ← último recurso
```

Cuanto más arriba, más cerca de cómo un usuario o lector de pantalla interactúa con la UI. `getByTestId` es escape hatch cuando ninguno de los anteriores aplica.

**Variantes asíncronas**: `findBy*` reintenta con timeout (default 1000 ms) hasta que el elemento aparece. Úsalo cuando esperas algo async — NO uses `waitFor(() => getBy...)`:

```tsx
// ❌ verbose, dos abstracciones para lo mismo
await waitFor(() => expect(screen.getByText('Loaded')).toBeOnTheScreen());

// ✅ directo
expect(await screen.findByText('Loaded')).toBeOnTheScreen();
```

`queryBy*` devuelve `null` si no encuentra — úsalo para **aserciones negativas** (`expect(screen.queryByText('Error')).toBeNull()`).

## Async — `waitFor`, `findBy`, fake timers

**Regla**: la assertion va **dentro** del `waitFor`, no fuera.

```tsx
// ❌ assertion fuera: el waitFor sirve de nada
const result = await waitFor(() => doThing());
expect(result).toBe(42);

// ✅ assertion adentro
await waitFor(() => expect(doThing()).toBe(42));
```

**Fake timers** para flows con `setTimeout` / animaciones:

```tsx
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('disappears after 5s', () => {
  render(<Banner kind="success" />);
  expect(screen.getByText('Saved')).toBeOnTheScreen();
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByText('Saved')).toBeNull();
});
```

Usa `act` al avanzar timers — sin él, React no flushea sus updates y verás warnings.

## Testing de pantallas con Expo Router

`expo-router/testing-library` expone `renderRouter`, que extiende el `render` de RNTL para resolver el filesystem-based routing en memoria.

### Patrones de mock del filesystem

**Inline (rápido)** — rutas en línea sin archivos:

```tsx
import { renderRouter, screen } from 'expo-router/testing-library';

test('navigates to profile', () => {
  renderRouter(
    {
      index: () => <Text>Home</Text>,
      'settings/profile': () => <Text>Profile</Text>,
    },
    { initialUrl: '/settings/profile' },
  );
  expect(screen.getByText('Profile')).toBeOnTheScreen();
});
```

**Solo presencia de rutas** — si el output no importa:

```tsx
renderRouter(['index', 'settings', 'details/[id]'], {
  initialUrl: '/details/123',
});
```

**Fixture real** — apunta a un directorio con la estructura:

```tsx
renderRouter('./test-fixtures/auth-flow', { initialUrl: '/sign-in' });
```

**Fixture + overrides** — fixture base con un layout mockeado:

```tsx
renderRouter({
  appDir: './test-fixtures/full-app',
  overrides: { 'auth/_layout': MockAuthLayout },
});
```

### Matchers de router

```tsx
expect(screen).toHavePathname('/settings');
expect(screen).toHavePathnameWithParams('/user?id=42');
expect(screen).toHaveSegments(['profile', '[id]']);
expect(screen).toHaveRouterState({ /* ... */ });
```

Permiten testear navegación sin asertar contra texto frágil de la UI.

### Pantalla en aislamiento — sin router

Cuando la pantalla NO depende del router (componente puro de presentación con props), úsala con `render` normal:

```tsx
// __tests__/UserCard.test.tsx
import { render } from '@testing-library/react-native';
import { UserCard } from '@/components/UserCard';

test('shows the user name', () => {
  render(<UserCard user={{ id: '1', name: 'Angel' }} />);
  expect(screen.getByText('Angel')).toBeOnTheScreen();
});
```

`renderRouter` solo cuando testeas comportamiento que depende del router (params, navegación, Stack.Protected). Si la pantalla solo recibe props ya resueltos, render normal.

## Mocks de native modules

El preset `jest-expo` cubre el SDK por defecto. Para mockear un módulo nativo custom (Expo Module propio o un paquete externo):

### Patrón canónico — directorio `mocks/`

Para un Expo Module nativo `ExpoClipboard`, el preset auto-mockea las funciones exportadas si existe el archivo:

```ts
// mocks/ExpoClipboard.ts
export async function hasStringAsync(): Promise<boolean> {
  return false;
}
export async function getStringAsync(): Promise<string> {
  return '';
}
```

El preset las inyecta vía `requireNativeModule`. Sin más wiring.

### `jest.mock` para hooks o paquetes JS-side

Para mockear funcionalidad expuesta en JS (no native), `jest.mock` clásico:

```ts
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getDevicePushTokenAsync: jest.fn().mockResolvedValue({ data: 'token' }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
```

Regla: si el módulo expone una API que tu test invoca, mockea **solo lo que el test usa**. Mocks parciales son aceptables; mocks llenos de stubs vacíos enmascaran cambios upstream.

### Auto-gen de mocks TS-safe (avanzado)

Para Expo Modules propios:

```sh
brew install sourcekitten  # macOS
npx expo-modules-test-core generate-ts-mocks
```

Genera signatures tipadas automáticamente. Útil cuando mantienes un módulo con superficie grande. Evita drift entre la firma real y el mock.

## Anti-patterns

- **Snapshot testing como default para UI**. Las docs oficiales de Expo recomiendan **Maestro e2e** para validación de UI; los snapshots se rompen con cambios cosméticos y nadie los lee. Reserva snapshots para output estable (configs serializados, copy estática lejos de la UI).
- **`getByTestId` cuando hay alternativa accesible**. Si el elemento tiene rol semántico o texto, usa `getByRole` o `getByText`. `testID` solo para casos sin alternativa (custom views sin role nativo).
- **Tests dentro de `app/`** (Expo Router). Todo archivo en `app/` es una ruta. Tests van en `__tests__/`.
- **`waitFor(() => getBy...)` cuando hay `findBy*`**. Verbose y duplica abstracción.
- **Assertions fuera del `waitFor`**. El `waitFor` se vuelve cosmético.
- **Avanzar timers sin `act`**. Causa warnings de React y comportamiento intermitente.
- **`jest.mock` lleno de stubs vacíos** "por si acaso". Mockear solo lo que el test usa; si añades un stub nuevo, es porque un test nuevo lo pide.
- **Testear implementación en vez de comportamiento**: aserción contra el state interno del hook en vez del output renderizado. Si refactorizas el hook sin cambiar comportamiento, los tests no deberían romperse. Regla heredada de `hexagonal-testing-strategy`.
- **Renderizar `renderRouter` para una pantalla que no depende del router**. Sobrecoste de setup; usa `render` normal.

## E2E — Maestro vs Detox en 2026

**Default en greenfield: Maestro.** YAML declarativo, flows fáciles de leer, cloud runner integrado, simulación de gestures complejos. Las docs de Expo ahora recomiendan Maestro explícitamente sobre snapshot testing para UI.

**Detox sigue viable** cuando:

- Tienes suite Detox ya establecida y la migración no aporta valor.
- Necesitas el sync engine fino de Detox (espera automática a JS thread + animations + network) para flows muy interactivos.
- Tienes infra CI específica para Detox (matchers de iOS / Android nativos).

Para greenfield 2026, **empieza con Maestro** y migra a Detox solo si el sync engine se queda corto. La decisión NO es purista — depende del flow real de la app.

## Volume por capa en RN-Expo

Aplica el principio de `hexagonal-testing-strategy` con estas asignaciones:

| Capa | Volume | Tooling |
|---|---|---|
| Domain / pure functions | **Muchos** | Jest puro, sin mocks |
| Custom hooks (application) | **Bastantes** | `renderHook` de RNTL + mocks de adapters |
| Components (presentation) | **Moderado** | RNTL behavior tests, sin snapshots por default |
| Screens (Expo Router) | **Pocos** | `renderRouter` solo para flows que dependen del routing |
| E2E | **Mínimos, críticos** | Maestro flows del happy path + edge cases que han mordido |

Si el grueso de tu suite son tests de screens con `renderRouter`, falta refactorizar hacia hooks + componentes puros (la skill `react-hexagonal-patterns` aplica directamente).

## Referencias

- [Expo · Unit testing](https://docs.expo.dev/develop/unit-testing/) — `jest-expo` preset, setup, TS, common pitfalls.
- [Expo Router · Testing](https://docs.expo.dev/router/reference/testing/) — `renderRouter`, mock filesystem patterns, router matchers.
- [Expo Modules · Mocking](https://docs.expo.dev/modules/mocking/) — directorio `mocks/`, `requireNativeModule`, auto-gen TS-safe.
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/) — queries, async, fake timers.
- [Maestro](https://maestro.dev/) — e2e declarativo recomendado por Expo en 2026.
