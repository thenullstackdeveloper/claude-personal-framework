---
name: framer-motion-patterns
description: Patrones de uso de Framer Motion (Motion) más allá del README — cuándo merece la pena vs CSS o View Transitions API, performance en GPU limitada / pantallas táctiles, AnimatePresence, layout animations, gesture handlers. NO es una skill hexagonal — es UX best practices reutilizables en cualquier app React con animaciones.
---

# Patrones Motion (Framer Motion) en producción

Esta skill NO es hex-related. Documenta decisiones técnicas sobre animaciones que se repiten en cualquier app React seria. La verdad útil de esta skill no es el README de Motion — es **cuándo Motion gana, cuándo pierde, y dónde la convención esconde performance**.

## Cuándo Motion gana vs native

**Motion gana claramente** cuando:

- La animación debe poder **interrumpirse** mid-transition. CSS transitions y la View Transitions API no son interruptibles; si las interrumpes, vuelven al estado real del DOM, no al estado animado actual.
- Hay **elementos interactivos durante la animación** (botones clicables, drag, hover). La View Transitions API monta un pseudo DOM que **bloquea pointer events** durante la transición — no puedes interactuar.
- Necesitas **layout animations cross-component** que la View Transitions API no maneja limpio cuando hay listas dinámicas o reorderings con identidad estable.

**Motion NO es claramente mejor** que CSS / Web Animations API para:

- Sequencing complejo, stagger, scroll-triggered, springs basados en velocity. Esto es un caso refutado por la verificación adversarial del research — no se sostiene categóricamente. Es decisión por caso. Mide.
- Page-level swaps sin interactividad. La View Transitions API es nativa, sin payload JS, perfecta para esto.

Regla operativa: **interruptibilidad o interactividad mid-animation → Motion. Page swap simple → View Transitions. Hover/focus visual simple → CSS.**

## Performance — la trampa del individual-transform

**Verificado contra Motion's official performance docs**:

```ts
// Individual transforms — NO GPU-accelerated
animate(el, { x: 100, scale: 2 });

// Full transform string — SÍ GPU-accelerated
animate(el, { transform: 'translateX(100px) scale(2)' });
```

La razón: Motion implementa `x`, `y`, `scale`, etc. vía CSS custom properties (variables). El browser **no acelera por hardware** transformaciones aplicadas vía variables CSS, aunque visualmente parezca una transform. Para hot paths (animaciones a 60Hz, gestos drag, contenido en pantalla auxiliar de bajo perfil GPU), usa la string completa.

**Implicación para targets touch / low-GPU** (pantalla auxiliar, dispositivo embedded):

- Auditar todos los `animate({ x, y, scale, rotate })` y migrar a `transform` string.
- Preferir `opacity` y `transform` sobre `width`, `height`, `padding`, `border` (esto sí es comúnmente sabido y se sostiene como guía direccional, aunque la formulación maximalista *"animar layout properties cuesta >100ms por re-render"* fue refutada en su forma absoluta — depende del componente y la GPU).

## AnimatePresence

Patrón canónico para animar entrada/salida de componentes condicionalmente renderizados:

```tsx
<AnimatePresence>
  {isVisible && (
    <motion.div
      key="popover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  )}
</AnimatePresence>
```

Gotchas y áreas que la documentación / práctica establecidas señalan pero que el research no verificó con números:

- **`mode="wait"` con listas dinámicas**: hace que el siguiente elemento espere a que el anterior termine de salir. Útil para page transitions, problemático en listas que pueden cambiar varios items a la vez (un solo `wait` serializa todo el ciclo). Si tu lista cambia ≥2 items simultáneamente, evalúa `mode="popLayout"` o sin `mode`.
- **`key` obligatorio**: AnimatePresence detecta entradas/salidas por `key`. Si dos hijos con el mismo `key` se intercambian o si el `key` cambia inadvertidamente (e.g., index como key en una lista filtrable), las animaciones se rompen o disparan donde no toca.
- **Hijos directos**: AnimatePresence solo detecta cambios en sus hijos directos. Wrappers intermedios (fragments incluidos) suelen funcionar, pero componentes que renderizan condicionalmente al hijo dentro de sí mismos rompen la detección. Mover el conditional al padre.

## Layout animations

`layout` prop hace que Motion mida el bounding box antes/después del cambio de layout y anime la transición. Útil para reordenamientos en listas, expandir/colapsar paneles, transiciones de view-switching.

Costes a tener en cuenta:

- **Coste de medición**: cada componente con `layout` ejecuta `getBoundingClientRect` cada render. En listas grandes (>100 items) o con re-renders frecuentes, puede ser perceptible. Aplica `layout` quirúrgicamente.
- **Conflictos con CSS transitions** sobre las mismas propiedades. Si tienes `transition: transform 200ms` en CSS y `layout` en Motion, el resultado es impredecible. Elige uno.
- **`layoutId` para morph entre componentes distintos**: un `motion.div layoutId="hero"` desmontado de un sitio y montado en otro hace morph automático. Útil para transitions visualmente "continuas" entre vistas. Mismo coste de medición, multiplicado por la cantidad de morphs en flight.

El research no surfacó números concretos sobre el overhead de `layout` en GPU baja vs CSS transitions equivalentes. Si tu target es una pantalla auxiliar con GPU integrada modesta, **mide antes de aplicar `layout` ampliamente**. La intuición no es buena guía aquí.

## Gesture handlers

Motion expone `whileTap`, `whileHover`, `whileDrag`, y handlers explícitos (`onTap`, `onDrag`, `onDragEnd`). Patrones que se repiten:

- **Composición con event handlers nativos**: `onClick` nativo y `onTap` de Motion no son intercambiables. `onTap` distingue tap de drag (si hay movimiento, no es tap); `onClick` no. Para componentes que pueden draggearse y también ser clicados, **usar `onTap`**, no `onClick`.
- **`drag` requiere `dragConstraints`** salvo que quieras que el elemento se mueva libremente fuera del viewport. Para drag-to-reorder en listas, usar `Reorder.Group` + `Reorder.Item` (API dedicada).
- **Pinch / multi-touch**: Motion no lo cubre nativo. Para pinch-zoom y gestos multi-touch hay que combinar con otra librería (`@use-gesture/react`) o implementarlo manual con pointer events.

## Anti-patterns

- **Individual transforms en hot paths**. `animate({ x, y, scale })` en un loop de 60Hz cuesta CPU porque no se acelera. Usa `transform` string completo.
- **View Transitions API para UIs interactivas**. Pseudo DOM bloquea clicks durante la transición. Si el usuario puede interactuar mientras anima, Motion es la elección — no es preferencia, es requisito funcional.
- **Asumir "Motion siempre mejor que CSS"**. El research adversarial refutó la formulación maximalista. Para hover/focus visuales simples y transitions deterministas no-interruptibles, CSS es más barato (menos JS, menos paint). Decide por caso, no por defecto.
- **`AnimatePresence mode="wait"` con listas que cambian varios items**. Serializa el ciclo de salida-entrada de cada item; resultado: animación que dura N veces lo esperado. Usa `mode="popLayout"` o ningún mode.
- **`key` derivado del índice de lista** cuando la lista puede reordenarse o filtrarse. AnimatePresence dispara animations de entrada/salida en posiciones equivocadas. Usar id estable del item.
- **`layout` prop reflexivo en cada `motion.div`**. Cuesta medición en cada render. Aplica a los componentes que realmente cambian de layout.
- **`onClick` en elementos draggables**. Crea triggers fantasma al final de un drag. Usar `onTap`.

## Caveats — qué no está verificado a fondo

Esta skill se escribió con material verificado mayormente sobre **performance** (individual transforms, View Transitions, transform vs layout properties) y **decisión técnica de cuándo Motion** (interruptibilidad). Las secciones de AnimatePresence, layout animations y gesture handlers se basan en documentación oficial pero **el research no surfaceó números concretos** sobre:

- Overhead exacto de `layout` prop vs CSS transitions en GPU limitada.
- Comportamiento exacto de `AnimatePresence mode="wait"` en listas dinámicas grandes.

Si tu target (pantalla auxiliar táctil, dispositivo embedded) es sensible a estos puntos, **mide empíricamente** antes de adoptar la recomendación al pie de la letra.

## Referencias

- [Motion — Performance](https://motion.dev/docs/performance) — la verdad sobre individual transforms vs full transform strings.
- [Motion — Do you still need Framer Motion?](https://motion.dev/blog/do-you-still-need-framer-motion) — comparación honest con Web Animations API y View Transitions, incluyendo las limitaciones reales de la View Transitions API.
- [WICG view-transitions issue #157](https://github.com/WICG/view-transitions/issues/157) — limitación spec-level de non-interruptibility de la View Transitions API.
- [Maxime Heckel — Framer Motion Layout Animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/) — buen tour por `layout` y `layoutId` con casos prácticos.
- [Motion — Gestures](https://www.framer.com/motion/gestures/) — referencia de la API completa.
