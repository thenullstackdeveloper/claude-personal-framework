---
name: hexagonal-testing-strategy
description: Estrategia de testing para proyectos hexagonales (ports & adapters), agnóstica al lenguaje y al framework. Define la pirámide hex, qué se testea por capa, anti-patterns frecuentes, política fakes > mocks, criterios para E2E. La cargan `hexagonal-architect` (para auditorías) y `hexagonal-test-reviewer` (para revisar suites existentes o diseñar tests de módulos refactorizados).
---

# Estrategia de testing para arquitectura hexagonal

Esta skill concentra las reglas de testing que el resto del catálogo (architect, refactor agent, test-reviewer) aplica. Es agnóstica al lenguaje y al framework — los detalles concretos (Vitest/Jest/Pytest, fakes con `Map`, integration con TestContainers, etc.) viven en skills por stack.

## La pirámide hexagonal de tests

Hex invierte ligeramente la pirámide clásica: la base no es solo "tests unitarios", es **tests del dominio** (puros, rapidísimos, sin I/O). La cima no es "E2E", es **tests del boundary** (HTTP, CLI, eventos publicados) que validan el contrato externo.

| Capa | Qué se testea | Cómo | Volumen relativo |
|---|---|---|---|
| Dominio | Invariantes de entidades y value objects, métodos de negocio puros, servicios de dominio | Lenguaje puro. **Sin mocks, sin fs, sin red, sin reloj real.** | El más alto. La base de la pirámide. |
| Aplicación | Orquestación de casos de uso sobre puertos | **Fakes en memoria** de los puertos. Sin librerías de auto-mock. | Alto. Uno o dos casos por intención del usuario. |
| Infraestructura | Adapters que implementan puertos contra sistemas reales | Integración real: fs temporal, parser real, contenedor de DB, servidor de prueba. | Medio. Más lentos, menos numerosos. |
| Boundary (HTTP/CLI/desktop) | Contrato externo: rutas, status codes, shape de respuesta | Tests de controller con app fake, o E2E selectos. | Bajo. Solo el contrato, no la lógica. |

Si la pirámide aparece invertida (más tests de infra que de dominio), la lógica probablemente está acumulada en el sitio equivocado — el dominio está vacío y la infra carga reglas de negocio.

## Tests del dominio

Reglas duras:

- **Sin mocks, sin stubs.** Si necesitas mockear algo para testear el dominio, está mal modelado — el "algo" probablemente debería ser un puerto en aplicación o un value object inyectable.
- **Sin I/O.** No leas ficheros, no toques la red, no abras BD. Si el test requiere algo de eso, no es test de dominio.
- **Sin reloj real.** Si el dominio depende del tiempo, inyecta un `Clock` value object y pásalo. El test usa un clock fijo.
- **El test es lenguaje puro contra entidades.** Construyes la entidad con sus invariantes, invocas el método de negocio, compruebas el resultado o que se lanzó el error de dominio esperado.

Cubre: invariantes (no se puede crear una entidad en estado ilegal), métodos de negocio (qué pasa al aplicar la operación), errores de dominio (cuándo se lanzan), igualdad de value objects.

## Tests de aplicación

- **Fakes en memoria de los puertos.** Cada puerto tiene su fake explícito implementando la interface. El fake es **la definición ejecutable del contrato del puerto**: si el fake hace X, el contrato dice que cualquier adapter debe hacer X.
- **No `vi.mock`/`jest.mock` automáticos** salvo casos puntuales. Los mocks automáticos esconden el contrato; los fakes lo materializan. Ver "Fakes vs mocks" abajo.
- Cubre: el caso de uso compone correctamente, llama a los puertos en el orden esperado, propaga errores del dominio, devuelve el shape correcto.

Ejemplo conceptual: un caso de uso `InstallPreset` recibe `CatalogPort` + `WriterPort`. El test instancia el caso de uso con un `InMemoryCatalog` (con presets predefinidos) y un `RecordingWriter` (que captura lo escrito). Ejecuta el caso de uso, comprueba qué se escribió y en qué orden.

## Tests de infraestructura

- **Integración con el sistema real**, no mockeado. Para fs, un directorio temporal. Para DB, un contenedor (TestContainers o equivalente) o BD efímera. Para parsers, el parser real con fixtures de input.
- Cubre: el adapter implementa el contrato del puerto correctamente y maneja los casos extremos del sistema real (ENOENT, malformed input, transacciones, encoding).
- **Más lentos y menos numerosos** que los anteriores. Si tienes 200 tests de infra y 20 de dominio, sospecha: la lógica probablemente vive en infra cuando debería estar en dominio.

Anti-señal: si necesitas tests de infra para verificar reglas de negocio (¿el usuario admin puede hacer X? ¿la cuota se respeta?), el test está en la capa equivocada — esa regla pertenece al dominio.

## Tests del boundary

El boundary es HTTP, CLI, eventos publicados, respuestas WebSocket — cualquier salida hacia el mundo exterior.

- Tests de controller con app fake (NestJS Test module, Express con supertest, etc.) o E2E selectos contra el servidor real.
- Cubre: rutas existen, status codes son correctos, shape de respuesta coincide, errores de dominio se traducen al HTTP status esperado.
- **NO** prueba reglas de negocio aquí — eso ya está cubierto en dominio. Si pruebas "el admin puede crear N proyectos" via HTTP, estás duplicando el test de dominio con más fricción y más fragilidad.

### Mappers con omisiones deliberadas

Caso específico que aparece en el boundary. Cuando un mapper entidad → DTO de salida **omite campos** que la entidad sí carga (PII, financiero, internos, credenciales), el mapper requiere un **spec dedicado** que afirme explícitamente la ausencia de cada campo omitido.

Razón: cuando alguien añada un campo nuevo a la entidad mañana, el spec falla → fuerza decisión consciente sobre exponer o no. Sin spec, el campo nuevo se cuela silenciosamente al endpoint y nadie se entera hasta que un usuario o un auditor lo nota.

Aplica también a respuestas de WebSocket, eventos publicados, cualquier salida del sistema.

## Fakes vs mocks — política

**Preferencia clara por fakes.**

Un **fake** es una implementación real del puerto, simplificada para tests. Ejemplo: `InMemoryUserRepository` que guarda en un `Map` en lugar de en Postgres. Implementa la interface completa. Su comportamiento es predecible y los tests lo usan como cualquier otra implementación.

Un **mock** (en el sentido de `vi.mock`/`jest.mock`/`sinon`) es una réplica automática generada por una librería que intercepta llamadas y devuelve valores configurados por test.

Razones para preferir fakes:

1. **El fake materializa el contrato.** Para escribirlo, tienes que pensar en qué hace el puerto. Eso es información valiosa que queda capturada en código.
2. **El fake se reusa entre tests.** Un solo `InMemoryUserRepository` sirve para 50 tests. Los mocks típicamente se reescriben por test.
3. **El fake falla cuando el contrato cambia.** Si añades un método al puerto, el fake no lo implementa → compile error inmediato. Los mocks no lo detectan hasta runtime.
4. **El fake hace explícita la dependencia.** El test dice `const userRepo = new InMemoryUserRepository(); useCase = new GetUserUseCase(userRepo);`. Está claro qué se inyecta. Los mocks con auto-mock esconden la inyección.

**Cuándo un mock está justificado:**

- Librerías externas con superficie enorme que sería trabajo desproporcionado fakear (un SDK con 80 métodos del cual usas 2). En ese caso, mock puntual de los 2 métodos.
- Verificar que **se llamó algo** y no qué resultado se obtuvo (`expect(emailService.send).toHaveBeenCalledWith(...)`). Aquí el mock es la herramienta correcta porque el assertion es sobre la llamada, no sobre el resultado.

Reglas para escribir un buen fake:

- Implementa la interface entera, no solo lo que el test del día usa.
- Estado interno mínimo (Map, Array, contador). Sin lógica de negocio dentro del fake.
- Si el fake necesita lógica para ser útil (validación de unicidad, simulación de race conditions), pregúntate si esa lógica debería vivir en el dominio en lugar de duplicarse en el fake.

## E2E / smoke

Pocos y selectos. Solo dos tipos:

1. **Golden path** — el flujo más importante del producto funciona end-to-end. Login → acción principal → resultado. Si esto se rompe, todo arde; merece un E2E que lo proteja.
2. **Casos críticos** — escenarios que no se pueden cubrir con tests de capa porque exigen el sistema entero (autorización + transacción + side effect coordinado). Cuántos? Pocos. Si tienes más de un puñado, casi seguro estás duplicando coverage de capas inferiores.

Los E2E **no son el sitio donde validar reglas de negocio**. Si quieres asegurar que "el admin puede borrar proyectos ajenos", el test va en dominio. El E2E solo prueba que "una request bien autenticada a `DELETE /projects/:id` devuelve 204".

Coste de los E2E: lentos, frágiles, sensibles a cambios cosméticos (cambias el shape de un body y se caen 20 E2E que probaban el mismo body). Minimizar.

## Anti-patterns

- **Mockear el dominio.** Si tu test hace `vi.mock('@domain/...')`, mal. El dominio es puro y se construye, no se mockea.
- **"Test que comprueba el mock."** Tests que arman un mock con `mockReturnValue(X)` y luego comprueban que el código bajo prueba devolvió `X`. No se está probando nada — el mock decide el output.
- **Integration que duplica unit.** El mismo behavior (cálculo de impuestos, validación de email) testeado contra fake en memoria **y** contra DB real. El segundo no añade información si el dominio ya está cubierto en unit.
- **Snapshot tests del shape entero.** Cuando lo importante son uno o dos campos sensibles (que `password` no esté en la respuesta), un snapshot de toda la respuesta es ruido — se rompe por cambios cosméticos y no detecta el problema real. Afirmar campo a campo.
- **Mock de libs que son dominio.** Hashing, validación, parsing de identificadores propios. Si son tuyos, no se mockean — son parte del dominio que el test ejecuta directamente.
- **Test de aplicación que monta NestJS / Express completo.** Eso es un E2E disfrazado. Tests de aplicación inyectan fakes y prueban el caso de uso aislado.
- **Tests redundantes entre capas.** Mismo invariante de dominio probado en domain, application, infrastructure y boundary. La regla vive en dominio; el resto solo necesita confirmar que la propagación del error funciona.

## Métricas cualitativas de salud de la suite

Sin umbrales numéricos rígidos — el contexto manda. Pero estas señales merecen mirarse:

- **Velocidad por capa decreciente desde dominio hacia infra.** Dominio rapidísimo, aplicación rápido, infra lento. Si el dominio es lento, tiene I/O escondido. Si infra es rápida, está mockeando lo que debería integrar.
- **Pirámide invertida** (más infra que dominio) → señal fuerte de que la lógica vive en infra.
- **Suites que requieren orden** o que comparten estado entre tests → fakes mal escritos o tests acoplados.
- **"Tests verdes entre commits sin delta"** durante refactor → ground truth de que el refactor no rompió comportamiento (lección recurrente de los refactors hex: si el número de tests es idéntico antes y después y todos pasan, el comportamiento es idéntico).
- **Tests que cambian cada vez que cambia una implementación interna** sin cambiar comportamiento → demasiado acoplados a la implementación. Síntoma típico de mocks abusivos.
- **Cobertura alta pero suite frágil** → probablemente cobertura por boundary/integration en lugar de por dominio. La cobertura mide líneas, no comportamiento.
