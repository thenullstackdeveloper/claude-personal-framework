---
name: laravel-testing-rules
description: Reglas de testing en Laravel 12 + Pest 3+ — sintaxis, arch tests para boundaries hex, mutation testing, fakes nativos (Http/Bus/Queue/Mail/Event/Storage), container-aware mocks, RefreshDatabase, first-party DB assertions. Complementa `hexagonal-testing-strategy` (pirámide, fakes >> mocks, behavior over implementation) — esta skill concreta lo que cambia en Laravel.
---

# Testing en Laravel 12 + Pest 3+

Esta skill se carga cuando el proyecto usa Laravel + Pest. Asume la pirámide y las reglas genéricas de `hexagonal-testing-strategy`. Concreta el setup específico de Laravel/Pest, los fakes nativos sobre Mockery manual, los arch tests para enforce boundaries hex, y RefreshDatabase + first-party DB assertions.

Baseline: **Pest 3+** (default del scaffold Laravel 11+), **Laravel 12**, **PHP 8.3+**.

## Setup canónico

Laravel 11+ scaffold ya viene con Pest. Para añadirlo a un proyecto existente:

```bash
composer require pestphp/pest --dev --with-all-dependencies
composer require pestphp/pest-plugin-laravel --dev
./vendor/bin/pest --init
```

`phpunit.xml` se sustituye por la configuración de Pest. Tests viven en `tests/Feature/` y `tests/Unit/`.

`composer.json` scripts típicos:

```json
{
  "scripts": {
    "test": "./vendor/bin/pest",
    "test:arch": "./vendor/bin/pest --filter=arch",
    "test:mutate": "./vendor/bin/pest --mutate",
    "test:coverage": "./vendor/bin/pest --coverage --min=85"
  }
}
```

## Sintaxis Pest — `it`, `test`, `describe`

```php
// tests/Unit/Order/OrderTest.php

use App\Domain\Order\Order;
use App\Domain\Order\OrderStatus;

it('cannot be shipped when pending', function () {
    $order = new Order(/* pending */);
    expect(fn () => $order->ship())->toThrow(InvalidOrderTransitionException::class);
});

describe('Order::ship', function () {
    it('changes status to Shipped', function () {
        $order = orderInStatus(OrderStatus::Confirmed);
        $shipped = $order->ship();
        expect($shipped->status)->toBe(OrderStatus::Shipped);
    });

    it('emits OrderShipped event', function () {
        // ...
    });
});
```

Reglas:

- **`it('does X', ...)`** es el default. La cadena empieza siendo "the subject" — `it('ships an order', ...)` lee como "Order ships an order" (raro). Mejor `test('Order::ship returns a shipped order', ...)` o reformular: `it('returns a shipped order', ...)` con el `describe` poniendo el sujeto.
- **`describe(...)`** para agrupar casos del mismo subject. Soporta `beforeEach` anidado.
- **`expect($value)->toBe(...)`**: chain expectations. `not->toBe(...)` para negaciones.
- **`expect(fn () => ...)->toThrow(ExceptionClass::class)`** para asertar excepciones.

### Datasets (replacement de `dataProvider`)

```php
it('rejects invalid status transitions', function (OrderStatus $from, OrderStatus $to) {
    $order = orderInStatus($from);
    expect(fn () => $order->transitionTo($to))
        ->toThrow(InvalidOrderTransitionException::class);
})->with([
    [OrderStatus::Delivered, OrderStatus::Pending],
    [OrderStatus::Cancelled, OrderStatus::Confirmed],
    [OrderStatus::Pending, OrderStatus::Shipped],  // skip Confirmed
]);
```

Datasets nombrados:

```php
->with(['confirmed → cancelled' => [OrderStatus::Confirmed, OrderStatus::Cancelled], ...])
```

Útil para tablas de casos sin duplicar el body.

### Higher-order tests

Chain de expectations directo sobre el resultado de un closure:

```php
it('creates an order', function () {
    return CreateOrder::run($validInput);
})
    ->expect()
    ->status->toBe(OrderStatus::Pending)
    ->total->amount->toBeGreaterThan(0);
```

Útil pero menos legible que el approach normal. Reservar para casos con muchos asserts sobre el mismo objeto.

## Arch tests — enforce boundaries hex declarativamente

`arch()` de Pest 3+ es el mecanismo canónico para codificar las reglas de capas hex como tests. Falla el build si alguien rompe el boundary.

### Reglas básicas

```php
// tests/Arch/HexagonalBoundariesTest.php

arch('strict types everywhere')
    ->expect('App')
    ->toUseStrictTypes();

arch('no var_dump in source')
    ->expect('App')
    ->not->toUse(['dd', 'dump', 'var_dump', 'ray', 'die', 'exit']);

arch('domain is pure — no Laravel')
    ->expect('App\Domain')
    ->not->toUse([
        'Illuminate\Http',
        'Illuminate\Database',
        'Illuminate\Support\Facades',
        'request',
        'response',
    ]);

arch('application is pure — no HTTP, no Eloquent')
    ->expect('App\Application')
    ->not->toUse([
        'Illuminate\Http',
        'Illuminate\Database\Eloquent\Model',
    ]);

arch('domain entities are final readonly')
    ->expect('App\Domain')
    ->classes()
    ->toBeFinal()
    ->toBeReadonly();

arch('use cases have __invoke or handle')
    ->expect('App\Application')
    ->classes()
    ->toBeFinal();

arch('repositories are interfaces in domain, implementations in infrastructure')
    ->expect('App\Domain\*\Repository')
    ->toBeInterfaces();
```

### Presets shipped por Pest 3+

```php
arch()->preset()->php();        // PHP language best practices
arch()->preset()->security();   // No eval, no shell_exec, etc.
arch()->preset()->laravel();    // Laravel-specific rules
arch()->preset()->strict();     // The strictest baseline
arch()->preset()->relaxed();    // Less strict, more practical
```

**Default greenfield**: `php` + `security` + `laravel` + `strict`. Ajusta cuando un pattern legítimo dispare false positive.

### Expectations disponibles

| Expectation | Asegura |
|---|---|
| `toBeFinal` | Classes están marcadas `final` |
| `toBeReadonly` | Classes son `readonly` |
| `toBeAbstract` | Classes son `abstract` |
| `toBeClasses` / `toBeEnums` / `toBeInterfaces` / `toBeTraits` | Tipo de declaración |
| `toBeInvokable` | Tienen `__invoke()` |
| `toExtend(BaseClass::class)` | Heredan de la base |
| `toImplement(Contract::class)` | Implementan la interface |
| `toUseStrictTypes` | `declare(strict_types=1)` |
| `toUse(['Class1', 'fn1'])` / `not->toUse(...)` | Lista de usos prohibidos |
| `toOnlyBeUsedIn('Namespace')` | Solo invocados desde ese namespace |

Caveat importante: arch tests **solo capturan referencias estáticamente resolubles**. Llamadas via container (`app(Foo::class)`) o strings (`"App\\Foo"`) se les escapan. Por eso la regla "no `app()` en domain/app" es **convención disciplinaria + code review**, no solo arch test.

## Mutation testing (Pest 3+)

`pest --mutate` introduce pequeños cambios al código (cambia `==` a `!=`, `+` a `-`, etc.) y verifica que algún test falla. Mutantes que sobreviven = camino sin cobertura real.

```bash
./vendor/bin/pest --mutate                          # full mutation run
./vendor/bin/pest --mutate --bail                   # stop at first survivor
./vendor/bin/pest --mutate --min=90                 # require ≥90% mutation score
./vendor/bin/pest --mutate --filter=ShipOrder       # focus on a use case
```

Cuándo aplicar:

- **Use cases / domain services con lógica de decisión** (state machines, pricing, validation). Coverage al 100% NO garantiza branches cubiertos.
- **Releases de baseline antes de refactor grande** — confirma que la suite atrapa cambios sutiles.

Cuándo NO aplicar:

- **Controllers/Jobs/Listeners** triviales que solo delegan. La mutación añade ruido sin valor.
- **CI por defecto** con `--mutate` en cada PR — lento. Mejor weekly o on-demand.

## Feature vs Unit en hex

Criterio (heredado de `hexagonal-testing-strategy`, refinado para Laravel):

| Capa | Carpeta | Tooling |
|---|---|---|
| **Domain** (entities, VOs, domain services) | `tests/Unit/` | Pest puro, NO `RefreshDatabase`, NO container |
| **Application** (use cases) | `tests/Unit/` o `tests/Feature/` | Pest + fakes de puertos (in-memory adapters). Pueden hablar al container si necesitan |
| **Infrastructure adapters** (controllers, jobs, console, repositories) | `tests/Feature/` | Pest + Laravel TestCase + `RefreshDatabase` cuando toca DB |
| **End-to-end** (full HTTP flow) | `tests/Feature/` | Pest + HTTP testing (`$this->postJson`) + fakes (`Http::fake`, `Bus::fake`) |

**No** usar la división Feature/Unit por "toca Laravel container vs no". Mejor "Domain/App (logic) vs Infrastructure (boundary)" — más alineado con hex.

## Mocks container-aware — `$this->mock()` / `$this->instance()`

Cuando un test necesita sustituir una dependencia que el container resuelve, el patrón canónico (docs oficiales) es:

```php
use Mockery\MockInterface;
use App\Domain\Notifications\Notifier;

it('notifies on order shipped', function () {
    $this->mock(Notifier::class, function (MockInterface $mock) {
        $mock->shouldReceive('send')->once();
    });

    ShipOrder::run($order->id);
});
```

`$this->mock()` registra el mock en el container — cualquier resolución posterior recibe el mock. Equivalente bajo el capó: `$this->instance(Notifier::class, $mock)`.

Patrón alternativo con instance binding directo:

```php
$this->instance(OrderRepository::class, new InMemoryOrderRepository());
```

Particularmente útil para **fakes in-memory** (no mocks) — más alineado con "fakes >> mocks" de `hexagonal-testing-strategy`.

### Anti-pattern OFICIAL: NO mockear `Request` ni `Config`

Las docs de Laravel **explícitamente prohíben** mockear esos dos facades:

> You should not mock the Request facade. Instead, pass the input you desire into the HTTP testing methods such as `get` and `post` when running your test. Likewise, instead of mocking the Config facade, call the `Config::set` method in your tests.

```php
// ❌ NO
$this->mock(Request::class, fn ($m) => $m->shouldReceive('input')->andReturn('foo'));

// ✅ SÍ — HTTP testing real
$response = $this->postJson('/orders', ['customer_id' => 'foo', ...]);

// ❌ NO
$this->mock(Config::class, fn ($m) => $m->shouldReceive('get')->andReturn('test-key'));

// ✅ SÍ — Config::set
Config::set('services.payments.key', 'test-key');
```

## Fakes nativos > Mockery manual

Laravel ships fakes nativos para los componentes con I/O. Úsalos por default — son más expresivos y específicos que mocks manuales.

### `Http::fake()` para llamadas HTTP salientes

```php
use Illuminate\Support\Facades\Http;

it('sends payment to gateway', function () {
    Http::fake([
        'gateway.example.com/v1/charge' => Http::response(['id' => 'ch_123'], 200),
        'gateway.example.com/*' => Http::response('', 404),  // catch-all
    ]);

    ChargeCustomer::run($input);

    Http::assertSent(fn ($req) =>
        $req->url() === 'https://gateway.example.com/v1/charge'
        && $req['amount'] === 1000
    );
    Http::assertSentCount(1);
});
```

API completa:

```php
Http::fake();                              // blanket 200s, todo
Http::fake([$pattern => $response]);       // array por endpoint
Http::fake(fn (Request $r) => ...);        // callback

Http::sequence()                            // respuestas ordenadas
    ->push(['status' => 'ok'])
    ->push(['status' => 'failed'], 500);

Http::assertSent(closure);                  // ≥1 request match
Http::assertNotSent(closure);               // 0 requests match
Http::assertSentCount(n);                   // exactamente n
Http::assertNothingSent();                  // 0 requests
```

### `Http::preventStrayRequests()` — guardrail de suite

En el `TestCase` base del proyecto:

```php
abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();   // any unfaked outbound HTTP throws
    }
}
```

Cualquier test que olvide fake-ar un endpoint usado falla loud (`RuntimeException: Attempted request to [host] without a matching fake`). Cero tests pasando con tráfico real silencioso.

### `Bus::fake()` para colas (preferido sobre `Queue::fake()`)

```php
use Illuminate\Support\Facades\Bus;

it('queues image processing on order paid', function () {
    Bus::fake();

    PayOrder::run($input);

    Bus::assertDispatched(
        ProcessOrderImagesJob::class,
        fn (ProcessOrderImagesJob $job) => $job->orderId->equals($input->orderId)
    );
});
```

Diferencias `Bus::fake()` vs `Queue::fake()`:

- **`Bus::fake()`**: fake del Bus dispatcher. Cubre **jobs Y commands** dispatchados via Bus. Más completo.
- **`Queue::fake()`**: fake solo del Queue. No captura llamadas via `Bus::dispatch()` si pasan por command handler antes.

Default: **`Bus::fake()`** salvo razón concreta.

### Otros fakes nativos

```php
Mail::fake();
Mail::assertSent(OrderShippedMail::class, fn ($m) => $m->hasTo('angel@x.com'));

Notification::fake();
Notification::assertSentTo($user, OrderShippedNotification::class);

Event::fake([OrderShipped::class]);          // partial fake
ShipOrder::run($id);
Event::assertDispatched(OrderShipped::class);
Event::assertNotDispatched(OrderCancelled::class);

Storage::fake('s3');
Storage::disk('s3')->assertExists('orders/42.pdf');
```

## `RefreshDatabase` + first-party DB assertions

```php
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('persists a new order', function () {
    $input = createOrderInput();

    CreateOrder::run($input);

    $this->assertDatabaseHas('orders', [
        'customer_id' => $input->customerId->value,
        'status' => 'pending',
    ]);
    $this->assertDatabaseCount('orders', 1);
});
```

Reglas de `RefreshDatabase`:

- **Salta migrations si el schema está al día** — solo wrappea cada test en una transacción + rollback al final. Mucho más rápido que `DatabaseMigrations` o `DatabaseTruncation`.
- **NO mezclar `RefreshDatabase` con `DatabaseMigrations`** en la misma suite — el flag de "migrated" se desincroniza.
- **Driver**: SQLite in-memory para velocidad bruta en CI; driver real (Postgres/MySQL) con DB dedicada en test cuando los queries específicos del driver importan.

### DB assertions first-party (NO raw SQL en tests)

```php
$this->assertDatabaseHas('orders', ['status' => 'shipped']);
$this->assertDatabaseMissing('orders', ['id' => 999]);
$this->assertDatabaseCount('orders', 3);
$this->assertDatabaseEmpty('orders');
$this->assertSoftDeleted($order);
$this->assertNotSoftDeleted($order);
$this->assertModelExists($order);
$this->assertModelMissing($order);
$this->expectsDatabaseQueryCount(2);  // perf assertion
```

Anti-pattern: `DB::select('SELECT count(*) FROM orders')` o aserciones contra raw SQL específico. Acopla el test al storage backend.

## Anti-patterns

- **Mockear `Request` o `Config`**. Anti-pattern explícito de docs Laravel — usa HTTP testing + `Config::set`.
- **Tests reales contra APIs externas** sin `Http::fake()`. Flaky, lentos, dependientes de red. `Http::preventStrayRequests()` te lo recuerda.
- **Mockear Eloquent models** con `Mockery::mock(User::class)`. RefreshDatabase + factories es más simple y refleja realidad.
- **`Queue::fake()`** cuando `Bus::fake()` aplica. Bus cubre más.
- **Snapshot de responses HTTP** completas. Se rompen con cualquier cambio cosmético (timestamps, IDs random). Asserts específicos por campo o JSON path.
- **Factory states que duplican lógica de dominio**. Si una factory state implementa "make a shipped order" replicando el state machine del dominio, ese cálculo debería venir del dominio (`Order::ship()`).
- **Raw SQL en tests** (`DB::select(...)` aserciones). First-party DB assertions cubren el caso.
- **`->assertJson(...)` con árbol entero**. Asserts específicos por field o `assertJsonPath` para keys importantes.
- **Tests `tests/Feature/` que no tocan boundary**. Si el "feature test" no llama HTTP, console, queue, ni DB — es Unit. Sube a `tests/Unit/`.
- **Mocks anidados Mockery con `shouldReceive(...)->andReturn(...)` complejos**. Si necesitas eso, probablemente quieres un **fake in-memory** (clase concreta que implementa la interface) — más legible y reutilizable.
- **Pest `it()` con sujeto repetido en el string**. `describe('Order::ship')` + `it('changes status to Shipped')` lee mejor que `it('Order::ship changes status to Shipped')`.

## Volume por capa en Laravel

| Capa | Volume | Tooling |
|---|---|---|
| Domain (entities, VOs, services) | **Muchos** | Pest puro, sin DB, sin container |
| Application (use cases) | **Bastantes** | Pest + fakes in-memory de puertos |
| Repositories Eloquent | **Bastantes** | Pest + RefreshDatabase + factories + DB assertions |
| Controllers / Jobs / Console | **Moderado** | Pest Feature + HTTP testing / `dispatchSync` / `artisan` |
| End-to-end HTTP flows | **Mínimos, críticos** | Feature tests del happy path + edge cases que mordieron |
| Arch tests | **Pocos pero permanentes** | `arch()` declarando boundaries |

Si tu suite es 80% controller tests con DB, falta refactorizar hacia use cases + domain tests rápidos. La pirámide existe.

## Referencias

- [Pest · Architecture Testing](https://pestphp.com/docs/arch-testing) — `arch()` + presets.
- [Pest 3.0 release](https://pestphp.com/docs/pest3-now-available) — mutation testing + arch presets.
- [Laravel · Mocking](https://laravel.com/docs/12.x/mocking) — `$this->mock()`, `$this->instance()`, anti-patterns (Request, Config).
- [Laravel · HTTP Client testing](https://laravel.com/docs/12.x/http-client) — `Http::fake`, `preventStrayRequests`, `assertSent`.
- [Laravel · Database Testing](https://laravel.com/docs/12.x/database-testing) — `RefreshDatabase`, DB assertions.
- [Laravel News · Prevent stray requests](https://laravel-news.com/prevent-stray-requests) — guardrail de suite.
- [Kirschbaum · Mutation testing with Pest](https://kirschbaumdevelopment.com/insights/practical-guide-to-mutation-testing-with-pest) — práctica.
- [Fuseweb · 10 PestPHP arch tests for Laravel](https://www.fuseweb.nl/en/blog/2025/02/07/10-powerful-pestphp-arch-tests-laravel) — ejemplos reales.
