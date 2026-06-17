---
name: react-native-patterns
description: Patrones específicos de React Native + Expo SDK 53+ (Expo Router, Reanimated 4, Gesture Handler 3, Expo Modules API, puertos para storage/permisos/linking). Asume hex aplicado (`hexagonal-architect`), reglas TS en `typescript-hexagonal-rules`, spine de frontend en `react-hexagonal-patterns`, y reglas de stores en `zustand-patterns`. NO duplica esas skills — concreta lo que cambia en RN-Expo.
---

# Patrones React Native + Expo SDK 53+

Esta skill se carga cuando el proyecto usa React Native con Expo. Asume las cuatro capas del frontend hex (ver `react-hexagonal-patterns`) y se concentra en lo que cambia respecto a una app React web: routing file-based, animaciones en UI thread, gestos, módulos nativos, y los puertos canónicos del mundo móvil (storage, permisos, linking, push).

Baseline objetivo: **Expo SDK 53+** para greenfield 2026. Patrones marcados con guarda explícita cuando aplican antes (50-52). RN 0.83+ requiere New Architecture obligatoria desde SDK 55.

## Expo Router — file-based routing

### Estructura canónica

`app/_layout.tsx` raíz, grupos para compartir un layout sin contribuir a la URL:

```
app/
├── _layout.tsx                  ← root stack
├── (app)/                       ← grupo autenticado (no aparece en URL)
│   ├── _layout.tsx             ← guard aplicado aquí, NO per-screen
│   ├── (tabs)/                  ← tab navigator
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   └── profile.tsx
│   └── user/[id].tsx            ← dynamic route
├── sign-in.tsx                  ← libre
└── +not-found.tsx
```

Reglas:

- **Una pantalla solo puede aparecer en un grupo**. Si la necesitas en `(app)` y en `(auth)`, repensar; probablemente es un componente, no una pantalla.
- **Guards a nivel de layout, no per-screen**. El layout es el sitio donde compartes lifecycle. Per-screen multiplica el chequeo.

### Autenticación declarativa con `Stack.Protected` (SDK 53+)

Patrón actual recomendado por Expo:

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { useSession } from '@/hooks/useSession';

export default function RootLayout() {
  const { session } = useSession();
  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
```

Cuando `guard` cambia, el layout re-renderiza, el history de pantallas protegidas se borra, y la app navega al primer anchor disponible.

**Advertencia importante**: `Stack.Protected` es **client-side only**. NO sustituye auth server-side ni control de acceso real. El backend sigue siendo obligatorio. Tampoco hay redirect automático al deep-link después de auth — si quieres "volver a donde el usuario quería ir", captura manualmente.

**SDK 50-52** (sin `Stack.Protected`): fallback con `<Redirect>` dentro del layout, NO con `useEffect + router.replace` (cascada de renders). Documentar versión mínima en el README del proyecto.

### Typed routes

Opt-in en `app.json`:

```json
{ "experiments": { "typedRoutes": true } }
```

Estado: **beta sostenida** (SDK 51/52/53). No es default. Cuando está activo, tipa:

```tsx
// válidos:
<Link href="/about" />
<Link href={{ pathname: '/user/[id]', params: { id: '1' } }} />

// error de TypeScript:
<Link href="/abot" />                              // ruta inexistente
<Link href={{ pathname: '/user/[id]', params: { _id: 1 } }} />  // key wrong
```

Y los hooks aceptan generics:

```tsx
const { user } = useLocalSearchParams<{ user: string }>();
const router = useRouter();  // tipado para router.push('/...')
```

**Search params SIEMPRE son strings**, nunca numbers. Si esperas un ID numérico, parsea explícitamente:

```tsx
const { id } = useLocalSearchParams<{ id: string }>();
const userId = Number(id);
if (Number.isNaN(userId)) throw new Error(`invalid id: ${id}`);
```

El return type es `Partial<T>` — narrow antes de usar.

### `useLocalSearchParams` por defecto, `useGlobalSearchParams` con justificación

`useGlobalSearchParams` re-renderiza pantallas de **fondo** cuando cambia la URL. Útil cuando una pantalla observa cambios desde rutas no enfocadas (analytics, badges). Por defecto **prefer local** — la regla anti-perfomance es "if overused", no ban absoluto, pero el default debe ser local.

### Modal stacks

Una pantalla se declara modal en el layout, no en su componente:

```tsx
<Stack.Screen name="settings" options={{ presentation: 'modal' }} />
```

Cierre con `router.back()` o el handler nativo de swipe-down. La pantalla modal NO sabe que es modal; el layout lo decide.

### Anti-patterns de Expo Router

- **Lógica de negocio en `app/<route>.tsx`**. La pantalla compone, el flow vive en un custom hook (`useUserProfile(id)`). La regla de `react-hexagonal-patterns` aplica aquí especialmente — las pantallas de Expo Router son fáciles de engordar.
- **Navegación imperativa en `useEffect`** para auth (`if (!session) router.replace('/sign-in')`). Patrón legacy en SDK 53+. Usar `Stack.Protected`.
- **Prop drilling de search params** desde la pantalla de ruta a 5 niveles de componentes. Si más de 1-2 componentes hijos necesitan el param, ponlo en un store o en un context scoped.
- **`useGlobalSearchParams` por defecto**. Empezar con `useLocalSearchParams`; subir a global solo cuando hay observación cross-route.
- **Pantallas que duplican el layout del grupo**. Si copias la cabecera/footer en cada `.tsx`, falta `_layout.tsx`.

### React Navigation vs Expo Router en 2026

Expo Router envuelve React Navigation por debajo. En greenfield Expo SDK 53+, **default a Expo Router**: file-based routing, deep linking automático, typed routes, layouts compartidos. React Navigation puro se justifica solo en proyectos bare-RN sin Expo, o cuando necesitas control extremo del navigator (animaciones custom complejas) que no encaja en el modelo declarativo.

## Reanimated 4 + Gesture Handler 3 — UI thread discipline

Reanimated 4 **solo soporta New Architecture**. Si el proyecto está en SDK 55+ ya es obligatoria; en versiones antes hay que asegurarse de que está activada.

### Worklets — directiva y captura

Funciones que corren en el UI runtime se marcan con la directiva al inicio:

```tsx
const animate = (toValue: number) => {
  'worklet';
  sharedValue.value = withTiming(toValue);
};
```

El Babel plugin (en SDK 55+ vive en el paquete separado `react-native-worklets`) convierte la función en un objeto serializable.

**Anti-pattern crítico — captura del closure**: los worklets capturan **todo** lo referenciado en su cuerpo. Capturar objetos JS grandes (themes, store snapshots) hace que se serialicen al UI runtime cada vez. Patrón correcto:

```tsx
// ❌ captura `theme` entero
const style = useAnimatedStyle(() => ({
  backgroundColor: theme.colors.primary,
}));

// ✅ extrae el escalar antes
const primary = theme.colors.primary;
const style = useAnimatedStyle(() => ({
  backgroundColor: primary,
}));
```

### `scheduleOnUI` / `scheduleOnRN` (Reanimated 4)

Reanimated 4 renombró `runOnUI` → `scheduleOnUI` y `runOnJS` → `scheduleOnRN`. Los antiguos siguen exportados desde `react-native-reanimated` por backwards-compat, pero la API canónica vive en `react-native-worklets`:

```tsx
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

// desde JS thread: programar trabajo en UI
scheduleOnUI(() => {
  'worklet';
  sharedValue.value = 100;
});

// desde un worklet: programar callback en JS
scheduleOnRN(() => {
  setReactState(...);
});
```

Diferencia con la API antigua: argumentos se pasan directo al scheduler, no vía función devuelta.

### Anti-pattern crítico — leer `.value` desde JS

```tsx
// ❌ bloquea JS thread hasta que UI thread devuelve el valor
const current = sharedValue.value;  // en un useEffect, handler, etc.
```

Hay caso documentado de **500 ms** de regresión en initial render por este patrón. Las docs lo califican de "negligible in most cases" pero el spike aparece cuando UI thread está ocupado o las reads son frecuentes. Mitigaciones oficiales:

- **Confinar reads a worklets** (dentro de `useAnimatedStyle`, `useDerivedValue`).
- **`useAnimatedReaction` + `scheduleOnRN`** cuando JS necesita reaccionar a cambios del shared value:

```tsx
useAnimatedReaction(
  () => sharedValue.value > 0.5,
  (isHigh, prev) => {
    if (isHigh !== prev) scheduleOnRN(setIsHigh, isHigh);
  },
);
```

### Animar transform/opacity/backgroundColor — NO layout props

Regla #1 de performance: animar **non-layout props**. Las layout props (`top`/`left`, `width`/`height`, `margin`, `padding`) fuerzan recálculo de layout por frame del shadow tree.

```tsx
// ❌
const style = useAnimatedStyle(() => ({ left: offset.value }));

// ✅
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
}));
```

`backgroundColor` es seguro (no afecta layout). `opacity` y `transform` son los baratos universales.

### Layout animations en FlatList

`skipEnteringExitingAnimations` evita animar enter/exit al mount/unmount de la lista:

```tsx
<FlatList
  data={items}
  itemLayoutAnimation={LinearTransition}
  skipEnteringExitingAnimations  // solo anima cambios in-place
  renderItem={...}
/>
```

Sin esto, la primera renderización dispara `EnteringAnimation` por cada item — feo y caro.

### Gesture Handler 3 — composición con hooks

Tres hooks para gestos en el mismo componente:

| Hook | Semántica | Uso típico |
|---|---|---|
| `useCompetingGestures` | Uno gana; el primero en activarse cancela al resto | drag vs long-press |
| `useSimultaneousGestures` | Todos activos a la vez | pan + zoom + rotate en una galería |
| `useExclusiveGestures` | Prioridad por orden de argumentos | gesto principal con fallback |

```tsx
const drag = Gesture.Pan().onUpdate(...);
const longPress = Gesture.LongPress().onStart(...);
const gestures = useCompetingGestures(drag, longPress);

return <GestureDetector gesture={gestures}>...</GestureDetector>;
```

La API imperativa antigua (`Gesture.Race/Simultaneous/Exclusive`) sigue existiendo para composición global; los hooks son el patrón para el mismo componente.

`useMultipleGestures` fue renombrado a `useCompetingGestures` en v3.0 — si ves la API vieja en un PR, es señal de versión antigua.

### Anti-patterns de animación

- **`useState` para valores que se animan**. El state-driven re-render derrota el propósito del UI thread. Usa `useSharedValue` siempre que la pantalla anime.
- **Capturar el theme entero / store entero en `useAnimatedStyle`**. Extrae el escalar antes (`const c = theme.colors.primary`).
- **`console.log` dentro de un worklet** sin la directiva apropiada (no funciona en algunos contextos). Si necesitas debug, `scheduleOnRN(console.log, ...)`.
- **Animar `width` / `height` con Reanimated** en vez de `transform: scale`. El segundo no toca layout.

## Platform branches — extensiones de archivo, NO `Platform.OS`

Metro resuelve automáticamente `.native.tsx`, `.ios.tsx`, `.android.tsx`, `.web.tsx`. Para platform-specific behavior:

```
components/
├── Map.tsx              ← fallback base, REQUERIDO para deep-linking
├── Map.native.tsx       ← iOS + Android (nativo)
└── Map.web.tsx          ← web (renderiza nada o un placeholder)
```

`Platform.OS === 'ios'` adentro del componente es **anti-pattern** para diferencias estructurales — engorda el componente con ramas e impide tree-shaking. Para diferencias pequeñas (un padding distinto), `Platform.select({ ios: 8, android: 12 })` es aceptable.

**Importante para Expo Router**: rutas en `app/` deben tener archivo base sin sufijo o el deep-linking no resuelve. `app/profile.tsx` + `app/profile.web.tsx` ✓; solo `app/profile.web.tsx` rompe.

## Puertos del mundo móvil

Adapters específicos de RN que la app trata como puertos hexagonales (consumidos por custom hooks, no por componentes).

### Storage — AsyncStorage / SecureStore / MMKV

Tres opciones según el caso:

| Lib | Cuándo | Notas |
|---|---|---|
| `expo-secure-store` | Tokens, secretos, claves de cifrado | Keychain iOS / EncryptedSharedPreferences Android. Async. Solo strings <2KB. |
| `react-native-mmkv` | State app frecuente (settings, drafts) | Sync, ~30× más rápido que AsyncStorage. Funciona con New Architecture. |
| `@react-native-async-storage/async-storage` | Default histórico, KV simple, no sensible | Async. Más lento; reemplazable por MMKV en greenfield. |

Patrón de puerto (el custom hook NO sabe qué lib hay debajo):

```tsx
// infrastructure/preferences-store.ts
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV({ id: 'prefs' });

export const preferencesPort = {
  getTheme: () => storage.getString('theme') as Theme | undefined,
  setTheme: (t: Theme) => storage.set('theme', t),
};
```

```tsx
// hooks/usePreferences.ts — application
import { preferencesPort } from '@/infrastructure/preferences-store';

export const usePreferences = () => {
  const [theme, setTheme] = useState(preferencesPort.getTheme() ?? 'system');
  // ...
};
```

### Permisos — máquina de estados

Camera, location, microphone, notifications. Todos siguen el patrón `granted | denied | undetermined` (más `blocked` en algunos). El componente NO consulta el estado directamente; un puerto centraliza:

```tsx
// infrastructure/camera-permissions.ts
import * as ImagePicker from 'expo-image-picker';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export const cameraPermissionsPort = {
  async query(): Promise<PermissionStatus> {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    return status;
  },
  async request(): Promise<PermissionStatus> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status;
  },
};
```

```tsx
// hooks/useCamera.ts — outcome union (ver react-hexagonal-patterns)
type Outcome =
  | { kind: 'idle' }
  | { kind: 'denied' }
  | { kind: 'capturing' }
  | { kind: 'photo', uri: string };
```

### Linking — deep linking como puerto

`Linking.getInitialURL()` y el listener de `Linking.addEventListener('url', ...)` van envueltos en un adapter. El custom hook expone una signal limpia:

```tsx
// infrastructure/deep-link.ts
import * as Linking from 'expo-linking';
import { useDeepLinkStore } from '@/stores/deep-link';

export async function startDeepLinkAdapter() {
  const initial = await Linking.getInitialURL();
  if (initial) useDeepLinkStore.setState({ url: initial });
  const sub = Linking.addEventListener('url', ({ url }) => {
    useDeepLinkStore.setState({ url });
  });
  return () => sub.remove();
}
```

El composition root (`app/_layout.tsx` raíz o un `setup/`) arranca y para el adapter. Expo Router resuelve la mayoría de deep links via routing nativo — el puerto se usa para handlers custom (auth callbacks, notifications open).

### Push notifications — adapter vs hook

`expo-notifications` es el adapter. Su API (request permission + getDevicePushTokenAsync + listeners) NO debe aparecer en componentes ni en hooks de pantallas. Un puerto la envuelve y un hook expone la API del flow:

```tsx
// infrastructure/push.ts
import * as Notifications from 'expo-notifications';

export const pushPort = {
  async register() { /* permiso + token + envío al backend */ },
  onReceived(handler: (n: Notification) => void) {
    return Notifications.addNotificationReceivedListener(handler);
  },
};
```

```tsx
// hooks/usePushNotifications.ts — application
export const usePushNotifications = () => {
  // outcome: idle | denied | registered | error
};
```

El componente solo dispara `register()` y reacciona al outcome.

## Native modules — Expo Modules API

Para necesidades nativas custom (acceder a un SDK iOS/Android, un sensor exótico, perf-critical):

- **Expo Modules API** (Swift / Kotlin) es la vía recomendada en el ecosistema Expo. Minimal boilerplate. Compatible con New Architecture (Fabric / TurboModules) y legacy automáticamente.
- **SDK 56+** introduce **Inline Modules**: definir el módulo directamente en el proyecto (archivos Swift/Kotlin al lado del JS/TS), sin package separado. Generación de TS automática vía `expo-type-information`.

**No** afirmar que el equipo de RN recomienda Expo Modules sobre Turbo Modules — no hay declaración oficial. Expo Modules es recomendado **dentro del ecosistema Expo**; en proyectos bare-RN, Turbo Modules es el camino.

### Cuándo prebuild

Default `expo prebuild` cuando:

- Necesitas un módulo nativo custom (incluso Inline Module).
- Necesitas un paquete con código nativo no incluido en Expo Go (notificaciones avanzadas, in-app purchases, etc.).
- Necesitas configurar Info.plist / AndroidManifest más allá de lo que `app.json` expone.

Vive en Expo Go puro mientras tu app solo use Expo SDK packages + JS-only libs. El test del humo: si añades un paquete que requiere `expo install` y avisa de "requires development build", es señal de prebuild.

### EAS Build profiles

Tres perfiles convencionales en `eas.json`:

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal" },
    "production":  {}
  }
}
```

`development` para el dev build local (con Hermes debugger). `preview` para repartir internamente (TestFlight / internal track). `production` para releases.

App variants (multiple app IDs en la misma instalación) via `app.config.ts` que lee `process.env.APP_VARIANT`. Documentado en EAS Build docs.

### Anti-patterns de native modules

- **Bridge JS de algo que ya existe como módulo nativo en Expo SDK**. Antes de escribir un native module custom, busca el paquete `expo-*` correspondiente.
- **`getNativeModule` directo** sin pasar por el TurboModule registry — solo aplica a legacy y rompe con New Architecture.
- **Lógica de negocio en el módulo nativo**. El módulo expone la primitiva (acceso al SDK, lectura del sensor); el flow vive en JS.

## Referencias

- [Expo Router · Typed routes](https://docs.expo.dev/router/reference/typed-routes/) — generics + flag opt-in.
- [Expo Router · Protected screens](https://docs.expo.dev/router/advanced/protected/) — patrón SDK 53+ con advertencia client-side.
- [Expo Router · Common navigation patterns](https://docs.expo.dev/router/basics/common-navigation-patterns/) — grupos (app)/(auth) + `.native.tsx`.
- [Reanimated · Worklets](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/) — directiva, captura, `scheduleOnUI`/`scheduleOnRN`.
- [Reanimated · Performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) — anti-pattern de leer `.value` desde JS, animar non-layout props.
- [Andrei Calazans · Reanimated blocking JS thread](https://andrei-calazans.com/posts/reanimated-blocking-js-thread/) — caso documentado de 500 ms.
- [Gesture Handler · Composition](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/gesture-composition/) — `useCompetingGestures` / `useSimultaneousGestures` / `useExclusiveGestures`.
- [Expo Modules · Overview](https://docs.expo.dev/modules/overview/) — Swift/Kotlin, New Architecture, sin posicionarse sobre Turbo Modules.
- [Expo SDK 56 · Inline Modules](https://docs.expo.dev/modules/inline-modules-reference/) — módulos sin package separado.
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv) — storage rápido sync para New Architecture.
