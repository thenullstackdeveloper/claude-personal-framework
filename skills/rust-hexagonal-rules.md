---
name: rust-hexagonal-rules
description: Reglas hexagonales específicas para proyectos Rust. Complementa hexagonal-architect cuando trabajas en ese stack — ownership en domain, manejo de errores tipado por capa, async fn en traits, puertos como traits, organización de workspace/crates. Para la estrategia de testing por capa, ver `hexagonal-testing-strategy`.
---

# Reglas hexagonales para Rust

Esta skill se carga junto con `hexagonal-architect` cuando el proyecto es Rust. Concreta los principios universales en decisiones específicas del lenguaje.

Para la estrategia de testing por capa, ver `hexagonal-testing-strategy` (agnóstica al lenguaje). Aquí solo lo verdaderamente específico de Rust.

## Domain — dominio puro de verdad

- **Sin frameworks**, sin `tokio`, sin `serde::Deserialize` derivado en entidades de dominio. El dominio es Rust puro: structs, enums, traits, impl. Si añades un derive externo (Serialize/Deserialize, sqlx::FromRow, diesel::Queryable), está mal modelado — esos derives pertenecen al DTO en infraestructura, no a la entidad.
- **Ownership en domain**: entidades inmutables por defecto. Métodos que cambian estado devuelven `Self` o un nuevo valor en vez de mutar in-place. Evita `Arc<Mutex<>>` en domain — si lo necesitas, normalmente el dominio está modelando concurrencia que pertenece a la aplicación o a la infraestructura.
- **Newtype pattern para identificadores**: `struct UserId(String)` en vez de pasear `String` puros. Evita confusiones entre `UserId`, `OrderId`, `EmailAddress`. El compilador es la barrera.
- **Value objects con `#[derive(Clone, PartialEq, Eq, Hash)]`** según semántica. Si comparas por valor, deriva `Eq`. Si vive en un `HashMap`, deriva `Hash`. No deriva más de lo necesario.

## Manejo de errores

- **`thiserror` para errores tipados por capa.** Cada capa define su propio enum de errores con `#[derive(thiserror::Error, Debug)]`. El dominio define `DomainError`, la aplicación `AppError`, los adapters errores propios traducibles.
- **`anyhow` solo en los bordes** — el binario principal (`main.rs`), tests de integración, scripts. Nunca en domain ni en interfaces públicas de la application.
- **`#[non_exhaustive]` en enums de error** que esperas extender. Evita breaking changes cuando añadas una variante.
- **Errores se traducen entre capas, no se pasan crudos.** Un `sqlx::Error` no aparece en application — el adapter lo convierte a un error del puerto. Igual para `reqwest::Error`, `std::io::Error`, etc.

## Async en application

Estado actual (verificado contra el blog oficial de Rust, diciembre 2023): **`async fn` en traits es nativo desde Rust 1.75**. Ese es el default para puertos definidos como traits.

```rust
// Default en Rust ≥1.75 — sin async-trait
pub trait UserRepository {
    async fn find_by_id(&self, id: &UserId) -> Result<User, RepositoryError>;
}
```

**`async-trait` solo en dos casos** (los identifica explícitamente el blog oficial):

1. **MSRV <1.75** — proyecto necesita soportar versiones más antiguas.
2. **Dispatch dinámico vía `dyn`** — los traits con `async fn` nativos **no son object-safe**, no puedes hacer `Box<dyn UserRepository>`. Si tu DI necesita runtime polymorphism (varios adapters intercambiables decididos en runtime), `async-trait` sigue siendo la forma estable hoy.

Alternativas en evolución (no estables aún a fecha de esta skill, validar antes de adoptar): `dynosaur` (pre-1.0), el propuesto operador `.box` en traits. Si la skill envejece, comprueba el estado.

**Implicación práctica para hex DI:** preferir genéricos sobre `dyn` cuando puedas. Un caso de uso con genérico sobre `UserRepository` resuelve en compile-time, es zero-cost, y NO obliga a `async-trait`. Solo cuando genuinamente necesites runtime polymorphism, aceptas el coste del `async-trait` macro.

## Traits como puertos

- **Convención de nombrado**: el trait describe lo que el use case **necesita**, no la implementación. `UserRepository`, `EmailSender`, `Clock` — no `PostgresUserRepo` (eso es el adapter concreto).
- **Ubicación**: los puertos viven con el use case que los define, no con sus implementaciones. `application/ports/` o `application/<use_case>/ports.rs`. La regla "el que necesita define" se traduce a Rust 1:1.
- **`Send + Sync` requirements**: en async contexts con tokio multi-thread, los puertos típicamente requieren `Send + Sync`. Documenta esto en el trait con `pub trait Port: Send + Sync` o como bound donde lo uses (`<P: Port + Send + Sync>`). No lo dejes implícito.
- **Errores del puerto como tipo asociado o concreto**: si el caller debe poder pattern-match sobre el error, define un enum concreto del puerto. Si solo lo propaga, un tipo asociado `type Error: std::error::Error + Send + Sync` funciona y desacopla la implementación.

## Workspace organization

Dos opciones reales, no hay tercera:

- **Single-crate con módulos**: `src/domain/`, `src/application/`, `src/infrastructure/`. Funciona perfecto hasta proyectos medianos. Más simple, más rápido de compilar, menos ceremonia. **Recomendado por defecto.**
- **Workspace con crates separados**: `crates/domain/`, `crates/application/`, `crates/infrastructure/`. Útil cuando: (a) varios binarios comparten el dominio y solo cambian adapters, (b) quieres forzar mecánicamente la regla de dependencias vía `Cargo.toml` (domain no depende de nada, application solo de domain, infrastructure de ambas), (c) el dominio es lo bastante grande para que compilar todo cada vez duela.

**No empieces con workspace** salvo que el caso (a) sea inmediato. Migrar de single a workspace cuando aparece la necesidad es directo; al revés es más raro.

## Convenciones del lenguaje que ayudan al hex

- **Module visibility estratégica**: `pub use crate::domain::User` en `lib.rs` o `mod.rs` hace que el dominio sea la API pública limpia. La infraestructura no se re-exporta — sólo se invoca internamente.
- **`#[must_use]` en builders y casos de uso** que devuelven resultados que el caller siempre debe consumir. El compilador avisa si lo ignoras.
- **`#[cfg(test)]` mods para fakes** dentro del mismo crate que el puerto, no en `infrastructure/`. El fake es parte del contrato testeado del puerto.
- **Lint a tope**: `#![deny(unsafe_code)]` en domain y application (la infraestructura puede necesitar `unsafe` para FFI). `#![warn(clippy::pedantic)]` o equivalente. `cargo deny` para auditar dependencias del dominio (no debe arrastrar transitivamente runtime libs).

## Anti-patterns frecuentes

- **`Arc<Mutex<>>` en domain como atajo**: si el dominio "necesita" estado compartido mutable, casi siempre indica que la concurrencia debería modelarse en la application (un actor, un canal) o que el dominio está malformulado (mutación accidental en vez de transición de estado explícita). Hex domain es inmutable; la concurrencia se gestiona en sus alrededores.
- **`#[derive(serde::Deserialize)]` en entidades de dominio**: si haces eso, el dominio sabe del formato externo. Solución: DTO con derive en infraestructura + mapper a entidad pura. Sí, es más código; sí, vale la pena.
- **`Box<dyn Port>` reflexivo**: convertirlo en el default "porque así inyecto" tiene coste y obliga a `async-trait`. Empieza con genéricos. Cambia a `dyn` cuando aparezca un caso de runtime polymorphism real (varios adapters seleccionables por configuración).
- **`unwrap()` y `expect()` en application**: el dominio puede `panic!` ante invariantes violadas (compile-time-impossible casos), pero la aplicación debe propagar errores. Si te ves haciendo `.unwrap()` en un use case, el tipo del error está mal modelado.
- **`Result<T, String>` o `Result<T, Box<dyn Error>>`** como salida de funciones públicas: pierde toda la información tipada. El primero es String-typing (el peor anti-pattern de error handling); el segundo destruye el pattern-match. Define un enum con `thiserror`.
- **Async commands aceptando `&str` o `State<'_, T>` sin `Result` wrap** (Tauri-specific, pero recurrente): la documentación de Tauri requiere `Result<T, E>` en async commands con borrowed types. Es regla del adapter, no estilo.
- **Servicios de dominio que reciben adapters concretos**: un `OrderService::new(postgres_repo)` rompe la regla. El servicio recibe `impl UserRepository` (genérico) o `&dyn UserRepository` — nunca el adapter concreto.

## Referencias

- [Master Hexagonal Architecture in Rust](https://www.howtocodeit.com/guides/master-hexagonal-architecture-in-rust) + [hexarch repo](https://github.com/howtocodeit/hexarch) — guía de referencia citable, modelo a leer antes de arrancar.
- [Error Handling in Rust](https://www.lpalmieri.com/posts/error-handling-rust/) (Luca Palmieri) — patrones de errores con `thiserror`/`anyhow` que se sostienen.
- [Async fn in traits, stable](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits/) (Rust blog) — fuente primaria sobre la decisión `async fn` nativo vs `async-trait`.
