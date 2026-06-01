---
name: tauri-patterns
description: Patrones específicos de Tauri 2 en la capa de adapters de una app hexagonal — wiring de commands como adapters, gestión de state, streaming de datos al frontend, background tasks, sidecars. Complementa hexagonal-architect cuando el adapter HTTP-ish del backend es Tauri. Para reglas del lenguaje Rust en sí, ver `rust-hexagonal-rules`.
---

# Patrones Tauri 2 en arquitectura hexagonal

Esta skill se carga cuando el proyecto usa Tauri 2. Concreta dónde encaja Tauri en las tres capas y qué primitivas se usan correctamente. Asume hex aplicado (ver `hexagonal-architect`) y reglas Rust generales (ver `rust-hexagonal-rules`).

## Dónde vive Tauri en el hex

**Tauri es infraestructura.** Concretamente, el adapter "HTTP-ish" del backend: traduce mensajes desde el frontend a invocaciones de casos de uso de la aplicación.

- `#[tauri::command]` handlers son **adapters de entrada**, equivalentes a controllers HTTP en una app NestJS / Express. **No tienen lógica de negocio.** Su trabajo es: deserializar input → invocar use case → serializar output.
- El dominio y la aplicación **NO conocen Tauri**. No `use tauri::*` ni en `application/` ni en `domain/`. Si te ves tentado, el caso de uso está mal partido — la dependencia debe ser un puerto que el adapter Tauri implementa o invoca.
- Plugins de Tauri (`tauri-plugin-shell`, `tauri-plugin-dialog`, etc.) son adapters concretos que la infraestructura puede usar. La aplicación habla con puertos abstractos; los adapters envuelven los plugins.

## State management

**Wiring canónico verificado contra docs oficiales de v2:**

```rust
// setup
app.manage(Mutex::new(MyState::default()));

// command
#[tauri::command]
fn my_command(state: State<'_, Mutex<MyState>>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    // ...
    Ok(())
}
```

Reglas verificadas:

- **No envuelvas en `Arc` manualmente**. Tauri ya envuelve internamente el valor pasado a `app.manage()`. Si haces `app.manage(Arc::new(Mutex::new(T)))` y luego `State<'_, Mutex<T>>`, Tauri **panicará en runtime** porque el tipo gestionado no es el que pides en `State`.
- **`std::sync::Mutex` > `tokio::sync::Mutex`** salvo que el guard cruce un `.await`. Esto coincide con la propia guía de Tokio: el async mutex es solo para guardas que viven a través de I/O.
- **El runtime-panic por mismatch de tipo es la trampa más común.** Si pones `app.manage(MyState::default())` y luego `State<'_, Mutex<MyState>>`, panic en el primer comando. Mantén el tipo en un sitio (alias o constante) y úsalo en ambos lados.
- **Para state mutable accedido en múltiples comandos**, el patrón es siempre `Mutex<T>` o `RwLock<T>`. Si solo se lee (configuración inicializada al arranque), `T` o `Arc<T>` simple basta — pero recuerda que Tauri ya envuelve por debajo, así que **el `Arc` extra es ruido**.

## Commands — organización y mecánica

**Commands en módulos `pub`, no en `lib.rs`.** Docs oficiales lo dicen literal:

> Commands defined in the `lib.rs` file cannot be marked as `pub` due to a limitation in the glue code generation.

El error subyacente es `E0255` (colisión de nombre en `__cmd__command_name`). Estructura recomendada:

```
src-tauri/src/
├── lib.rs            // setup + invoke_handler + nada más
├── commands/         // adapter layer
│   ├── mod.rs
│   ├── catalog.rs    // commands relacionados con catalog
│   └── install.rs    // commands relacionados con install
└── adapters/         // implementaciones de puertos
```

Los comandos en `commands/*.rs` son `pub` (la macro los re-exporta). En `lib.rs` solo el `setup` y el `tauri::generate_handler![cmd_a, cmd_b]`.

**Async commands deben devolver `Result<T, E>` para aceptar borrowed types** (`State<'_, T>`, `&str`). Es regla, no estilo — sin `Result` la macro falla. La gotcha la cubre el trait `AsyncCommandMustReturnResult` (GitHub issue tauri-apps/tauri#9797).

**Sync commands corren en el main thread y lo bloquean.** Si la operación es I/O, **debe** ser `async`. Si es CPU-bound corta (<1ms), sync OK. Si CPU-bound larga, lanza tarea con `tauri::async_runtime::spawn` y devuelve un handle / canal.

## Streaming al frontend

**Para hot paths (telemetría real-time, progress de operaciones largas, etc.) usar `tauri::ipc::Channel<T>` en lugar de `Window::emit`.**

Docs oficiales v2:

> The Tauri channel is the recommended mechanism for streaming data such as streamed HTTP responses to the frontend.

Razón: las returns de commands se serializan a JSON, lento para payloads grandes; `Channel<T>` evita esa serialización round-trip. Ejemplo de firma:

```rust
#[tauri::command]
async fn subscribe_telemetry(on_event: Channel<TelemetryFrame>) -> Result<(), String> {
    // spawn task that pushes frames into on_event
    Ok(())
}
```

**`Window::emit` / `app.emit` NO es para alta frecuencia.** Docs oficiales del event system v2:

> The event system is not designed for low latency or high throughput situations.

GitHub issue #8177 documenta crashes en Windows reproducibles a partir de ~100k emits en poco tiempo. La constraint es real; la mitigation que **sí** soportan los docs es usar `Channel<T>` para hot paths. **No atribuyas "throttle/batch en el emisor" a maintainers de Tauri** — eso no está oficialmente documentado como solución (verificado y refutado en research).

**Patrones complementarios sobre `Channel<T>`** (no documentados como obligatorios pero razonables):

- **Versionar el schema del payload** (`{ v: 1, frame: ... }`) cuando el frontend y el backend evolucionan a distinta velocidad — útil si en el futuro la app distribuye builds independientes.
- **Frame counter o timestamp** en el payload, no en metadata, para que el frontend pueda detectar drops o reordenar si llegara fuera de orden.

## Background tasks

`tauri::async_runtime::spawn` arranca tasks en el runtime tokio interno de Tauri. Para loops perpetuos (lectura de hardware, suscripciones a UDP, polling de un proceso externo):

```rust
app.handle().spawn(async move {
    loop {
        let frame = read_from_source().await;
        // send to channel, emit, etc.
        if shutdown_signal.is_cancelled() { break; }
    }
});
```

Reglas:

- **Mantén un handle de cancelación**. Un `CancellationToken` de `tokio-util` o un `oneshot::Sender<()>` en el state managed permite parar la task en el `on_window_event` cuando la ventana se cierra. Sin esto, las tasks sobreviven a la ventana y el proceso no termina limpiamente.
- **No bloquees el runtime**. Si la fuente es síncrona (FFI bloqueante, lectura `std::fs`), envuélvela en `tokio::task::spawn_blocking`.
- **Canales mpsc tokio** para enviar de la task al adapter del frontend (`Channel<T>` o similar). Evita `Mutex<Vec<T>>` para acumular frames — es susceptible a contention y backpressure mal gestionado.

## Lifecycle hooks

- **`tauri::Builder::setup`** — wiring inicial: `app.manage()` del state, spawn de background tasks, registro de plugins. Aquí es donde el composition root vive (equivalente a `main()` en una app sin Tauri).
- **`on_window_event`** — reacción a `Destroyed`, `CloseRequested`, `Focused`, etc. Sitio natural para disparar el shutdown de background tasks.
- **Plugins propios** cuando una pieza de funcionalidad se reusa en varios proyectos. Sigue la guía oficial: separar el plugin como crate y dependerlo. No te lances a plugin si solo lo usa un proyecto.

## Sidecars

Verificado contra docs oficiales de v2:

- **Config**: `bundle.externalBin` en `tauri.conf.json`, paths relativos a `src-tauri/`.
- **Naming**: cada sidecar binary debe nombrarse con sufijo `-$TARGET_TRIPLE` por plataforma. Ejemplo: `binaries/cli-x86_64-unknown-linux-gnu`, `binaries/cli-aarch64-apple-darwin`. Sin el sufijo, Tauri no encuentra el binario en el bundle.
- **Obtener el triple**: `rustc --print host-tuple` (Rust 1.84+) o `rustc -Vv | grep host` en versiones anteriores.
- **Invocación desde Rust**:

```rust
use tauri_plugin_shell::ShellExt;

let (mut rx, child) = app.shell()
    .sidecar("cli")
    .unwrap()
    .args(["--json", "list"])
    .spawn()
    .unwrap();

while let Some(event) = rx.recv().await {
    match event {
        CommandEvent::Stdout(line) => { /* parse JSON */ },
        CommandEvent::Stderr(line) => { /* log error */ },
        CommandEvent::Terminated(payload) => { /* check exit code */ },
        _ => {}
    }
}
```

**IPC con sidecars es stream-based, no call/return síncrono.** El sidecar emite a stdout, el adapter Rust parsea línea a línea. Si necesitas pedirle algo al sidecar mid-execution, el sidecar debe escuchar en stdin — diseñas el protocolo tú.

Diferencia con `Channel<T>`:

- `Channel<T>` = Rust → frontend, dentro del mismo proceso.
- Sidecar = Rust → otro proceso (Node, otro binario Rust, Python). Procesos separados, IPC vía stdin/stdout.

## Anti-patterns frecuentes

- **Commands en `lib.rs`**. Rompe `pub` por la limitación de glue code. Mueve a módulo.
- **`Arc::new(Mutex::new(T))` pasado a `app.manage()`**. Tauri ya envuelve. Runtime panic en el primer comando si el tipo en `State<'_, _>` no incluye el Arc.
- **`tokio::sync::Mutex` para state simple** (sin guard cruzando await). Penalización innecesaria. Usa `std::sync::Mutex`.
- **`Window::emit` en bucles 60Hz o equivalentes**. Migra a `Channel<T>`. Si no, recursos consumidos y bloqueos en Windows.
- **Lógica de negocio en `#[tauri::command]` handlers**. El adapter delega al use case. Si dentro del command hay `if/else` sobre reglas de dominio, el use case está incompleto.
- **Sidecars sin suffix `-$TARGET_TRIPLE`** en CI/release: el bundle no los encuentra. Automatizar el rename en el build script o configurar `externalBin` con paths que ya incluyan el triple.
- **Sync commands con I/O**. Bloquean el main thread → freezing de la ventana. `async fn` + `Result<T, E>` siempre que toques disco/red.
- **Background tasks sin cancellation**. La ventana se cierra, las tasks siguen vivas, el proceso no termina. Cancellation token en el `on_window_event(Destroyed)`.

## Referencias

- [Tauri v2 — State Management](https://v2.tauri.app/develop/state-management/) — Manager + State, runtime panic en mismatch.
- [Tauri v2 — Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/) — commands, async, `Channel<T>`.
- [Tauri v2 — Embedding External Binaries (Sidecars)](https://v2.tauri.app/develop/sidecar/) — `externalBin`, `-$TARGET_TRIPLE`, `ShellExt`.
- [Tauri v2 — Calling Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) — event system y su disclaimer de throughput.
- [GitHub Issue #8177 — emit perf crash](https://github.com/tauri-apps/tauri/issues/8177) — constraint del event system.
- [Tauri async background process](https://rfdonnelly.github.io/posts/tauri-async-rust-process/) — patrón canónico de background task + canal.
