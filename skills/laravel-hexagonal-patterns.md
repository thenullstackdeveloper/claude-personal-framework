---
name: laravel-hexagonal-patterns
description: Manual práctico de arquitectura hexagonal en Laravel 12 + PHP 8.3+ (API/backend). Controllers/Jobs/Console/Listeners como adapters, Service Container como composition root, Eloquent boundary con repository pattern, Form Requests + spatie/laravel-data, lorisleiva/laravel-actions como use case wrapping, slim skeleton (L11+). Asume reglas de lenguaje en `php-hexagonal-rules` y pirámide en `hexagonal-testing-strategy`.
---

# Patrones hexagonales en Laravel 12

Esta skill se carga cuando el proyecto usa Laravel 12+ como API/backend puro (NO Inertia, NO Livewire, NO Blade fullstack — eso queda out of scope). Asume las reglas del lenguaje en `php-hexagonal-rules` y se concentra en cómo el framework Laravel encaja en una arquitectura hex sin pelearse con él.

Baseline: **Laravel 12** (slim skeleton de Laravel 11+ heredado), **PHP 8.3+**.

## Layout — `app/Domain|Application|Infrastructure`

Default recomendado por esta skill:

```
app/
├── Domain/              ← entidades, VOs, domain services, eventos, excepciones
│   ├── Order/
│   │   ├── Order.php                    (entity/aggregate)
│   │   ├── OrderId.php                  (VO)
│   │   ├── OrderStatus.php              (enum backed)
│   │   ├── OrderRepository.php          (port — interface)
│   │   └── Events/OrderShipped.php
│   └── Shared/Money.php
├── Application/         ← use cases, application services, input DTOs
│   ├── Order/
│   │   ├── CreateOrder.php              (use case — Action class)
│   │   ├── ShipOrder.php
│   │   └── DTOs/CreateOrderInput.php
│   └── Shared/Clock.php                 (port — interface)
└── Infrastructure/      ← adapters (HTTP, persistence, queue, mail, console)
    ├── Http/Controllers/OrderController.php
    ├── Http/Requests/CreateOrderRequest.php
    ├── Persistence/Eloquent/
    │   ├── EloquentOrder.php            (Eloquent Model)
    │   ├── EloquentOrderRepository.php  (implementa OrderRepository)
    │   └── OrderMapper.php
    ├── Queue/Jobs/SendOrderConfirmationJob.php
    ├── Console/ShipPendingOrdersCommand.php
    └── Providers/AppServiceProvider.php
```

Razones del default:

- **Cero config**: el namespace `App\` ya está mapeado por composer PSR-4. Solo añades subcarpetas.
- **Familiar al desarrollador Laravel**: sigue viendo `app/` como entry point.
- **Discoverable**: `php artisan ...` y los providers funcionan sin alterar el bootstrap.

Alternativa: **`src/` PSR-4 separado** del namespace `App\` cuando el proyecto pasa a monorepo o quieres aislar el dominio para reuso. Requiere ajustar `composer.json`:

```json
{
  "autoload": {
    "psr-4": {
      "App\\": "app/",
      "Domain\\": "src/Domain/",
      "Application\\": "src/Application/"
    }
  }
}
```

Trade-off: `src/` deja claro que el dominio no es "Laravel code" — más portable, más ceremonia.

**Decisión**: empieza con `app/Domain|Application|Infrastructure`. Migra a `src/` solo cuando el dominio crece a >50 archivos y emerge una necesidad real de reuso fuera de Laravel.

## Service Container como composition root

Las **bindings** viven en Service Providers — típicamente `AppServiceProvider` o uno dedicado por bounded context.

### `bind` para interface → implementation (port → adapter)

```php
namespace App\Infrastructure\Providers;

use App\Domain\Order\OrderRepository;
use App\Infrastructure\Persistence\Eloquent\EloquentOrderRepository;
use Illuminate\Support\ServiceProvider;

final class PersistenceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(
            OrderRepository::class,
            EloquentOrderRepository::class,
        );
    }
}
```

**Use cases reciben el puerto por constructor** — Laravel resuelve el adapter automático:

```php
final class ShipOrder
{
    public function __construct(
        private OrderRepository $orders,
        private Clock $clock,
        private EventDispatcher $events,
    ) {}

    public function __invoke(ShipOrderInput $input): void { /* ... */ }
}
```

### `singleton` para servicios stateless

Para servicios sin state (la mayoría de repositorios, services de dominio, formatters) — una instancia por request:

```php
$this->app->singleton(Clock::class, SystemClock::class);
$this->app->singleton(OrderRepository::class, EloquentOrderRepository::class);
```

Diferencia con `bind`:

| Método | Cuándo |
|---|---|
| `bind` | Cada resolución crea instancia nueva. Stateful, builders, cosas con per-call config. |
| `singleton` | Una instancia compartida durante el request lifecycle. Stateless services, repositorios. |
| `scoped` | Una instancia por "request scope" en Laravel Octane / workers de larga vida. **Úsala en Octane** para evitar memory leaks por singletons que retienen state. |

Default greenfield: **`singleton`** para todo lo que no tenga state per-call. Es el menor sorprendente y más performante.

### Laravel 12: `#[Bind]` attribute

Para casos simples, Laravel 12 trae el atributo `#[Bind]` directamente en interfaces:

```php
use Illuminate\Container\Attributes\Bind;

#[Bind(EloquentOrderRepository::class)]
interface OrderRepository
{
    public function save(Order $order): void;
}
```

Equivale a la binding en provider. Útil cuando la interface vive cerca de su único adapter conocido. Cuando hay varios candidatos (test fake vs prod adapter), sigue siendo más claro en provider.

### `app()` / `resolve()` — solo en bordes

Convención hexagonal (NO mandato de Laravel): **NUNCA llamar `app()`, `resolve()`, `App::make()` desde dominio o application**. Eso convierte el container en una dependencia global oculta — anti-hex.

Sitios donde sí es legítimo:

- **Composition root** (providers, `bootstrap/app.php`): es el sitio.
- **Adapters de framework** (controller, middleware) cuando Laravel mismo no lo inyecta automático.
- **Bootstrap de tests** (test base case).

En use cases y servicios de dominio: dependencias por constructor, fin de la discusión.

## Eloquent boundary

Eloquent es **infraestructura**. El dominio NO extiende Model, NO conoce QueryBuilder, NO sabe de tablas.

Dos modelos predominantes:

### (a) Recommended — Eloquent en infrastructure, entity de dominio aparte

```php
// app/Domain/Order/Order.php — entity pura
final readonly class Order
{
    public function __construct(
        public OrderId $id,
        public CustomerId $customerId,
        public OrderStatus $status,
        public Money $total,
    ) {}

    public function ship(): self { /* ... */ }
}

// app/Infrastructure/Persistence/Eloquent/EloquentOrder.php — modelo Eloquent
final class EloquentOrder extends Model
{
    protected $table = 'orders';
    protected $guarded = [];
    // sin métodos de dominio
}

// app/Infrastructure/Persistence/Eloquent/EloquentOrderRepository.php
final class EloquentOrderRepository implements OrderRepository
{
    public function findById(OrderId $id): ?Order
    {
        $row = EloquentOrder::find($id->value);
        return $row !== null ? OrderMapper::toDomain($row) : null;
    }

    public function save(Order $order): void
    {
        EloquentOrder::updateOrCreate(
            ['id' => $order->id->value],
            OrderMapper::toRow($order),
        );
    }
}

// app/Infrastructure/Persistence/Eloquent/OrderMapper.php
final class OrderMapper
{
    public static function toDomain(EloquentOrder $row): Order { /* ... */ }
    /** @return array<string, mixed> */
    public static function toRow(Order $order): array { /* ... */ }
}
```

Ventajas: dominio 100% portable, testeable sin DB, lógica de invariantes en VOs/entities limpia. Coste: mapper bidireccional + boilerplate.

### (b) Pragmático — Eloquent como entity con query restringido a `infrastructure/`

Modelo Eloquent es la entity de dominio pero **prohibido query directo desde controllers/use cases**. El use case habla con un repositorio que internamente usa Eloquent.

```php
final class EloquentOrderRepository implements OrderRepository
{
    public function findById(OrderId $id): ?Order
    {
        return Order::find($id->value);  // Order extends Eloquent\Model
    }
}
```

Ventajas: menos mapper boilerplate, productividad alta para CRUDs. Coste: el dominio conoce Eloquent (acoplado a Laravel), tests del dominio necesitan DB o factories.

**Decisión por proyecto**:

- **(a) por default** cuando el dominio es la pieza central (regla de negocio compleja, lifespan largo, posible migración fuera de Laravel).
- **(b) pragmático** para APIs CRUD donde el coste del mapper supera el beneficio. Aún así, mantén `Order` puramente con métodos de dominio (sin `whereX(...)` scopes que mezclan query con dominio).

### Anti-pattern del "repositorio inútil"

Repositorio que **solo wrappea Eloquent** sin añadir valor:

```php
// ❌ repositorio que es un proxy
final class OrderRepository
{
    public function findById($id): ?Order { return Order::find($id); }
    public function all(): Collection { return Order::all(); }
}
```

Si tu repositorio es esto, **borra el repositorio y usa Eloquent directo** — o súbele el dominio (modelo (a)). El repositorio aporta cuando:

- Implementa una interface de dominio (port).
- Encapsula queries complejas con nombre de intención (`findPendingOrdersOlderThan(...)`).
- Hace mapping a entities de dominio puras.

Si NINGUNA de las tres aplica, es ceremonia.

## Input adapters — Form Requests + DTOs

Patrón canónico:

```php
// app/Infrastructure/Http/Requests/CreateOrderRequest.php
final class CreateOrderRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.sku' => ['required', 'string'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
        ];
    }

    public function toInput(): CreateOrderInput
    {
        $v = $this->validated();
        return new CreateOrderInput(
            customerId: CustomerId::fromString($v['customer_id']),
            items: array_map(
                fn(array $i) => new OrderItemInput($i['sku'], $i['qty']),
                $v['items'],
            ),
        );
    }
}
```

```php
// app/Infrastructure/Http/Controllers/OrderController.php
final class OrderController
{
    public function __construct(private CreateOrder $createOrder) {}

    public function store(CreateOrderRequest $request): JsonResponse
    {
        $order = ($this->createOrder)($request->toInput());
        return response()->json(OrderResource::make($order), 201);
    }
}
```

El controller queda **plano**: extrae input validado, llama al use case, devuelve response. La validación es responsabilidad del Form Request; el dominio confía en que el input es estructuralmente válido.

### Evolución: `spatie/laravel-data`

`spatie/laravel-data` unifica Form Request + DTO + API Resource en una sola clase tipada:

```php
final class CreateOrderData extends Data
{
    public function __construct(
        public readonly string $customerId,
        /** @var DataCollection<int, OrderItemData> */
        public readonly DataCollection $items,
    ) {}
}
```

Cuando se inyecta en un controller, Laravel valida automáticamente desde el request. Cuando se construye manualmente (job, console), `CreateOrderData::validateAndCreate($payload)`.

**Decisión**:

- **`spatie/laravel-data`** por default en greenfield. Reduce redundancia (validación inferida de tipos + `#[Rule]`/`#[Required]` para casos avanzados).
- **Form Request + DTO manual** cuando quieres cero deps de paquetes externos o el equipo ya tiene mucho Form Request escrito.

Caveat de `laravel-data`: validación NO corre automática salvo cuando el `Data` se resuelve desde un Request — para construcción manual usa `validateAndCreate()`. Atributos como `#[Date]` requieren Carbon, no strings.

## Use cases como Action classes

`lorisleiva/laravel-actions` empaqueta un use case como una clase con `handle()` + traits para hacerla invocable desde **varios adapters de entrada**:

```php
use Lorisleiva\Actions\Concerns\AsAction;

final class ShipOrder
{
    use AsAction;

    public function __construct(
        private OrderRepository $orders,
        private Clock $clock,
        private EventDispatcher $events,
    ) {}

    public function handle(OrderId $id): Order
    {
        $order = $this->orders->findById($id)
            ?? throw new OrderNotFoundException($id);
        $shipped = $order->ship($this->clock->now());
        $this->orders->save($shipped);
        $this->events->dispatch(new OrderShipped($shipped));
        return $shipped;
    }

    public function asController(Request $request, string $id): JsonResponse
    {
        return response()->json($this->handle(OrderId::fromString($id)));
    }

    public function asCommand(Command $command, string $id): int
    {
        $this->handle(OrderId::fromString($id));
        $command->info("Shipped order {$id}");
        return 0;
    }
}
```

Mismo `handle()` invocable desde:

- **HTTP**: `Route::post('/orders/{id}/ship', ShipOrder::class)` (via `AsController`).
- **Queue**: `ShipOrder::dispatch($id)` (via `AsJob`).
- **Console**: `php artisan order:ship {id}` (via `AsCommand`).
- **Event listener**: subscribir a un evento (via `AsListener`).
- **Tests**: `ShipOrder::mock()` (via `AsFake`).

Caveat de nomenclatura: los **traits** son PascalCase (`AsController`, `AsJob`); los **métodos adapter** que escribes son camelCase (`asController`, `asJob`). La comunidad confunde esto.

**Decisión**:

- **`lorisleiva/laravel-actions`** cuando el mismo use case se invoca desde >1 adapter. Una clase, un dominio del problema.
- **Use case manual (class with `__invoke()`)** cuando solo se invoca desde HTTP. La librería añade ceremonia que no aporta.

## Jobs como adapter de cola

```php
// app/Infrastructure/Queue/Jobs/ProcessImageJob.php
final class ProcessImageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly ImageId $id) {}

    public function handle(ProcessImage $useCase): void
    {
        $useCase($this->id);  // delegate to application use case
    }
}
```

Reglas:

- **El Job NO tiene lógica de negocio.** Recibe input, invoca el use case. Punto.
- **Inyección por `handle()`** — Laravel resuelve dependencies del container.
- **Constructor solo guarda input serializable**. Si necesitas pasar una entity, pasa su ID y resuelve dentro del handle.
- **`ShouldQueue`** para asíncrono; `dispatchSync()` para tests deterministas.
- **Retries / backoff** en propiedades de la clase (`public int $tries = 3;`) — son comportamiento de queue, no de dominio.

## Events / Listeners

Los **domain events** se disparan desde la application layer (use case):

```php
// app/Application/Order/ShipOrder.php
$this->events->dispatch(new OrderShipped($order));
```

Listeners en infrastructure reaccionan con side effects (mail, broadcast, notify):

```php
// app/Infrastructure/Events/Listeners/SendShippedEmail.php
final class SendShippedEmail
{
    public function __construct(private Mailer $mailer) {}

    public function handle(OrderShipped $event): void
    {
        $this->mailer->send(new OrderShippedMail($event->order));
    }
}
```

Reglas:

- **Eventos son readonly DTOs** con la data necesaria — `OrderShipped` lleva el `Order` o sus IDs, no el repo.
- **Listeners en `infrastructure/`** porque hacen I/O (mail, broadcast, webhook).
- **El use case NO conoce listeners**. Despacha el evento y sigue.
- **NO Eloquent observers** para domain events. Los observers se disparan en hooks de persistence (saved, deleted) — son boundary de infrastructure, no de dominio. Para domain events, usar `Event::dispatch()` desde el use case.

## Console commands como adapter

Mismo principio que Jobs y Controllers:

```php
final class ShipPendingOrdersCommand extends Command
{
    protected $signature = 'orders:ship-pending';

    public function handle(ShipPendingOrders $useCase): int
    {
        $count = $useCase();
        $this->info("Shipped {$count} orders");
        return self::SUCCESS;
    }
}
```

El comando es input adapter. La lógica vive en `ShipPendingOrders` use case.

## Slim skeleton (Laravel 11+) — `bootstrap/app.php`

Laravel 11+ unificó el bootstrap. Una sola entrada:

```php
// bootstrap/app.php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [/* ... */]);
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->renderable(function (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        });
    })
    ->create();
```

Beneficios:

- **Sin Kernel.php** scattered (`app/Http/Kernel.php`, `app/Console/Kernel.php`, `app/Exceptions/Handler.php` desaparecen).
- **Exception rendering centralizado**: mapea domain exceptions a HTTP en un solo sitio.
- **Middleware registration** explícito en el bootstrap.

Para hex: el `withExceptions` es el sitio donde mapeas `DomainException → HTTP 422`, `OrderNotFoundException → HTTP 404`, etc. NUNCA hagas ese mapping en controllers — está atando dominio a HTTP.

## Anti-patterns

- **Lógica de negocio en controllers** (`if ($order->status === 'pending') { ... }`). Eso es un use case.
- **Eloquent en domain/application** (`use Illuminate\Database\Eloquent\Model;` desde `app/Domain/`). Boundary roto.
- **`app()` / `resolve()` en domain/application**. Container global oculta dependencias. Constructor injection.
- **Fat models** con scopes/accessors/observers que esconden side effects (audit, cache, broadcast). Eso es infrastructure.
- **Factory patterns acoplados a Eloquent** sin separar fixture (test) de creation (app). Factories son test fixtures; en producción, `Order::create(...)` desde el repositorio.
- **`Request` inyectado en use cases**. El use case recibe un DTO tipado, no un `Request` (acoplado a HTTP). Form Request o `Data::class` traduce.
- **`dd()` / `dump()` / `var_dump()`** en cualquier capa. Si necesitas debug, `Log::debug(...)` con context.
- **Domain events via Eloquent observers** (`booted() { static::created(...) }`). Observers están en la persistence boundary; los domain events los dispara la application.
- **Repositorios que devuelven `Collection<Eloquent\Model>`** al dominio. Devuelve `array<DomainEntity>` o un `Collection<DomainEntity>` propio.
- **Use cases que llaman a otro use case** sin justificar (composition by composition). Si un use case necesita orquestar varios, probablemente sea un nuevo use case con un nombre del problema. Si los necesita por reuse trivial, considera un domain service.
- **`@phpstan-ignore`** scattered sin comentario. Cada ignore documenta una decisión consciente o es deuda.

## Referencias

- [Laravel · Container](https://laravel.com/docs/12.x/container) — bindings, singleton, scoped, `#[Bind]`.
- [Laravel · Service Providers](https://laravel.com/docs/12.x/providers) — composition root canónico.
- [Laravel · Bootstrap (Laravel 11+ slim skeleton)](https://onecodesoft.com/blogs/laravel-11-slim-skeleton-guide-to-new-minimalist-structure) — `bootstrap/app.php`.
- [lorisleiva/laravel-actions](https://github.com/lorisleiva/laravel-actions) — single use case, multiple adapters.
- [Loris Leiva · Why I wrote Laravel Actions](https://lorisleiva.com/why-i-wrote-laravel-actions) — motivación y trade-offs.
- [spatie/laravel-data](https://spatie.be/docs/laravel-data/v4/introduction) — DTO unificado validación + transport + resource.
- [Adel F · Useless Eloquent repositories](https://adelf.tech/2019/useless-eloquent-repositories) — anti-pattern del repositorio proxy.
- [Daniele Barbaro · A year of hexagonal architecture in Laravel](https://medium.com/@daniele.barbaro/a-year-of-hexagonal-architecture-in-laravel-what-worked-what-didnt-and-what-i-shipped-542257415d8a) — retrospective realista.
- [Matthias Noback · Hex + DDD training](https://matthiasnoback.nl/training/) — referencia conceptual amplia.
