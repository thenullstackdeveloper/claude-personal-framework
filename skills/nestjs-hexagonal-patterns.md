---
name: nestjs-hexagonal-patterns
description: Manual práctico para aplicar arquitectura hexagonal (ports & adapters) a un proyecto NestJS. Mapea controllers / services / guards / providers / modules a las tres capas (dominio / aplicación / infraestructura) sin pelearse con el framework. Úsalo como referencia al refactorizar un módulo NestJS no-hexagonal o al diseñar uno nuevo.
---

NestJS es un framework con opiniones fuertes (decorators, DI propio, modules, lifecycle hooks). Aplicar hexagonal **no significa renunciar a NestJS** — significa empujar a NestJS al borde y mantener el corazón del módulo libre de él.

## Mapeo conceptual (la tabla central)

| Concepto NestJS | Capa hexagonal | Por qué |
|---|---|---|
| `@Controller` | Infraestructura (adapter HTTP) | Habla HTTP, deserializa, devuelve status codes. Lo que pasa dentro NO es lógica de negocio. |
| DTO con `class-validator` | Infraestructura (en el borde HTTP) | El DTO valida forma externa. La entidad de dominio valida invariantes de negocio. Son cosas distintas. |
| `@Injectable` Service que orquesta + accede a DB | **Romper en dos**: use case (aplicación) + repository adapter (infraestructura) | El service típico de NestJS mezcla las dos responsabilidades. Hay que separarlas. |
| `@Injectable` Service que es pura lógica | Servicio de dominio | Si no toca I/O y solo opera sobre entidades, vive en dominio. |
| `@Guard` | Infraestructura (cross-cutting adapter) | Adapter que protege el adapter HTTP. Las reglas que aplica (¿es admin? ¿tiene cuota?) sí pueden vivir en dominio; el guard las invoca. |
| Repository (TypeORM / Drizzle / Postgres pool) | Infraestructura (adapter del puerto) | Implementa un port definido en aplicación. |
| `@Module` | Infraestructura (wiring) | Es la "configuración del framework": qué adapter implementa qué puerto. |
| `main.ts` / `AppModule` | Infraestructura (composition root) | El punto donde se conecta todo. |
| Pipes, Interceptors, Filters | Infraestructura | Adapters de cross-cutting concerns. |
| Entidades del dominio | Dominio | **TypeScript puro, sin decorators de NestJS, sin entidades de ORM.** |

## Estructura de carpetas por módulo hexagonal

```
src/<module-name>/
├── domain/
│   ├── model/                # entidades, value objects
│   ├── errors/               # MyDomainError extends DomainError
│   └── services/             # servicios de dominio puros
├── application/
│   ├── use-cases/
│   │   └── <do-something>/
│   │       ├── do-something.use-case.ts
│   │       └── do-something.ports.ts   # interfaces que necesita
│   └── ports/                # solo si un puerto lo comparten >=2 use cases
├── infrastructure/
│   ├── http/
│   │   ├── <name>.controller.ts
│   │   └── dto/              # DTOs con class-validator
│   ├── persistence/
│   │   └── <name>.postgres-repository.ts  # adapter del repo port
│   └── ...                   # otros adapters: stripe, llm, queue
└── <module-name>.module.ts   # @Module wiring
```

Si el módulo es muy pequeño, no necesitas todas las subcarpetas. Pero respeta el orden conceptual: dominio dentro, infraestructura fuera.

## Capa por capa — qué SÍ, qué NO

### Dominio

**SÍ:** entidades, value objects, agregados, errores de dominio, servicios de dominio puros, eventos de dominio.

**NO:**
- `@Injectable`, `@Module`, ni ningún decorator de `@nestjs/*`.
- Imports de `@nestjs/typeorm`, `drizzle-orm`, `pg`, `axios`, `fs`, etc.
- Lógica condicional sobre HTTP status codes o request headers.
- DTOs (los DTOs son del borde).

Test del dominio: sin mocks. Si necesitas mockear algo, está mal modelado.

### Aplicación

**SÍ:** casos de uso (interactors). Cada uno orquesta el dominio + invoca puertos. Define los puertos (interfaces) que necesita.

**NO:**
- Decorators de NestJS.
- Imports de adapters concretos. Solo de puertos (interfaces que define la propia aplicación).
- Acceso a `process.env`, `fs`, base de datos, etc. — eso entra por puertos.

Test de aplicación: usa fakes en memoria de los puertos. Rápido, sin red ni disco.

### Infraestructura

**SÍ:** controllers (adapters HTTP), DTOs, repositories (adapters de persistencia), clientes HTTP, gateways de servicios externos, el `@Module` que cablea todo.

**NO importan:** los detalles de cómo el dominio modela las cosas — solo conoces las interfaces que necesitas implementar.

Test de infraestructura: integración real (DB de prueba, http calls a sandboxes). Más lentos, menos numerosos.

## Decisiones frecuentes en NestJS

### El service NestJS que "hace de todo"

Patrón antes:
```ts
@Injectable()
export class JobsService {
  constructor(@Inject(POOL) private pool: Pool) {}

  async enqueue(input: EnqueueDto, user: AppUser) {
    if (user.videosCount >= user.videosPerMonth) {
      throw new HttpException('quota_exceeded', 429);
    }
    const id = await this.pool.query('INSERT INTO ...');
    return { id };
  }
}
```

Después:
```ts
// application/use-cases/enqueue-job/enqueue-job.use-case.ts
export class EnqueueJobUseCase {
  constructor(
    private readonly jobs: JobQueuePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: EnqueueJobInput): Promise<Result<JobId, QuotaExceededError>> {
    if (!input.user.canEnqueue()) {
      return Err(new QuotaExceededError(input.user.id));
    }
    const job = Job.create(input, this.clock.now());
    await this.jobs.save(job);
    return Ok(job.id);
  }
}

// infrastructure/persistence/pg-boss-job.adapter.ts
@Injectable()
export class PgBossJobAdapter implements JobQueuePort {
  constructor(@Inject(BOSS) private boss: Boss) {}
  async save(job: Job): Promise<void> {
    await this.boss.send('pipeline', { ...job.toRaw() });
  }
}

// infrastructure/http/jobs.controller.ts
@Controller('jobs')
export class JobsController {
  constructor(private readonly enqueue: EnqueueJobUseCase) {}

  @Post()
  async create(@Body() dto: EnqueueJobDto, @AppUser() user: AppUser) {
    const result = await this.enqueue.execute({ user, ...dto });
    if (result.isErr()) throw new HttpException(result.error.message, 429);
    return { id: result.value };
  }
}
```

Tres ficheros en vez de uno. Cada uno con una responsabilidad clara. Tests del use case sin tocar pg-boss.

### Multi-tenant: dónde vive el `user_id`

- **Dominio**: el `User` o `AppUser` es una entidad con identidad propia. Reglas como "puedo encolar?" viven en la entidad o en un servicio de dominio.
- **Aplicación**: el use case recibe el `user` como input (o un `userId` si solo necesita el id) y opera con él.
- **Infraestructura**: el adapter de repository añade `WHERE user_id = $X` a las queries. El `@Guard` extrae el user del request y lo pone en el contexto.

Nunca el dominio sabe que existe multi-tenancy en SQL. Sabe que un job pertenece a un user; *cómo* se filtra eso en persistencia es problema de infraestructura.

### Errors

- **DomainError** (capa dominio): `QuotaExceededError`, `JobNotFoundError`, `UserBannedError`. Sin status codes.
- **HttpException** (capa infraestructura): el controller traduce el DomainError a HttpException con el código apropiado (429, 404, 403…). Una sola tabla de traducción en un filter o helper.

El use case devuelve `Result<T, DomainError>` o lanza `DomainError`. El controller traduce.

### DTOs vs entidades

- **DTO** (`@Body() CreateJobDto`): vive en `infrastructure/http/dto/`. Lleva `class-validator` decorators. Es la forma que llega por HTTP.
- **Entidad** (`Job`): vive en `domain/model/`. Garantiza invariantes de negocio. No tiene decorators ni se serializa a JSON directamente.
- **Mapper** en el controller o en el use case: `CreateJobDto → CreateJobInput` (objeto plano del dominio).

### Eventos de dominio

Si tienes side effects que el dominio "emite" (ej: "se ha encolado un job → notificar"), modélalos como **eventos de dominio** que la entidad acumula. El caso de uso los recoge tras la operación y los pasa a un `EventBusPort`. Adapter del bus es infra.

Esto te permite testar reglas tipo "al encolar se debe emitir JobEnqueued" sin tocar el bus real.

## Lo que NestJS aporta y dónde encaja

| Feature NestJS | Útil en | Cómo |
|---|---|---|
| DI container | Wiring de adapters a puertos | En el `@Module`, declaras `{ provide: JobQueuePort, useClass: PgBossJobAdapter }`. Con `useClass` o `useFactory`. |
| Lifecycle hooks (`OnModuleInit`) | Adapter setup (abrir conexión DB, suscribirse a bus) | Los pones en el adapter de infraestructura, nunca en el dominio. |
| Guards / Interceptors | Cross-cutting | Pero la **lógica** del guard puede llamar a un servicio de dominio. El guard es solo el adapter. |
| Pipes (validation) | Borde HTTP | Validan el DTO. La entidad de dominio valida lo suyo después. Dos validaciones distintas, no redundantes. |
| `@nestjs/typeorm` / mikro | Adapter de persistencia | NO uses sus entidades en dominio. Crea entidades de dominio puras y mapea en el adapter. |
| Swagger decorators | Borde HTTP | Solo en DTOs y controllers. Nunca en entidades de dominio. |

## Tests por capa

| Capa | Tipo | Velocidad | Cantidad |
|---|---|---|---|
| Dominio | Unitario puro, sin mocks | Rapidísimo | Mucho |
| Aplicación | Unitario con fakes en memoria de los puertos | Rápido | Mucho |
| Infraestructura | Integración real (DB, http stub) | Lento | Pocos pero contundentes |

Si tu test de "use case" necesita arrancar el módulo de NestJS con `Test.createTestingModule({...})`, probablemente tienes I/O en el use case o decorators donde no deben estar.

## Heurística cuando dudes

Pregúntate: *"si mañana cambio NestJS por Express, Fastify nativo, o un Worker que no es HTTP, ¿esto se rompe?"*

- Se rompe → es infraestructura.
- No se rompe → es dominio o aplicación.

Si la respuesta no es obvia, es la primera señal de que la separación está mal hecha.
