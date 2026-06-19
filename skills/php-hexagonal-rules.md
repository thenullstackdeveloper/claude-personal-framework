---
name: php-hexagonal-rules
description: Reglas hexagonales específicas para PHP 8.3+ (readonly classes, enums backed, named args, strict_types, exception hierarchy por capa, Result types vs exceptions, PHPDoc generics). Complementa `hexagonal-architect` cuando trabajas en PHP. NO específico Laravel — para reglas de Laravel framework ver `laravel-hexagonal-patterns`. Para la pirámide de testing ver `hexagonal-testing-strategy`.
---

# Reglas hexagonales PHP 8.3+

Esta skill se carga cuando el proyecto usa PHP. Asume hex aplicado (ver `hexagonal-architect`) y se concentra en cómo se expresa hexagonal en el lenguaje — qué features de PHP 8.2/8.3 usar para que las capas y los puertos sean explícitos, qué evitar.

Baseline: **PHP 8.3+** mínimo. PHP 8.2 sigue soportado por features (readonly classes); 8.3+ añade typed class constants, `json_validate()`, mejoras de readonly. PHP 8.4 (2024-11) trae property hooks y asymmetric visibility — adopción libre, no requisito.

## `declare(strict_types=1)` en TODOS los archivos

Primera línea de todo `.php` greenfield:

```php
<?php

declare(strict_types=1);

namespace App\Domain\Pricing;

// ...
```

Razón arquitectónica: sin `strict_types`, PHP coerciona silenciosamente (`int(5)` aceptado donde se espera `string`). En domain/application eso oculta bugs reales. Con `strict_types`, las violaciones son TypeError en runtime — más loud, más temprano.

No depende del lenguaje del archivo (test, helper, controller). Universal en greenfield. En legacy: añadir gradualmente por archivo (la directiva es per-file).

## Readonly classes (PHP 8.2+) para VOs y DTOs

Las **readonly classes** son el mecanismo idiomático para value objects inmutables y DTOs. Marcar la clase añade `readonly` a cada propiedad declarada y previene propiedades dinámicas:

```php
final readonly class Money
{
    public function __construct(
        public int $amount,
        public Currency $currency,
    ) {
        if ($amount < 0) {
            throw new InvalidMoneyException('amount must be non-negative');
        }
    }

    public function add(Money $other): self
    {
        if ($this->currency !== $other->currency) {
            throw new CurrencyMismatchException();
        }
        return new self($this->amount + $other->amount, $this->currency);
    }
}
```

Beneficios:

- Inmutabilidad enforce-ada por el lenguaje. Cualquier reasignación lanza Error.
- Validación en el constructor + métodos que devuelven nueva instancia → semántica de valor.
- Combina con **constructor promotion** para máxima brevedad sin perder claridad.
- Reemplaza la disciplina manual de write-once con builders / setters privados.

Limitaciones conocidas (documentar si bites):

- **Shallow immutability**: si una propiedad es un objeto mutable, el contenido es mutable.
- **No static properties** en readonly classes.
- **No untyped properties** — todas deben tener tipo declarado.
- **Solo extensible por otras readonly classes** (no readonly → readonly y viceversa).
- **No `#[AllowDynamicProperties]`** combinable.

**Default greenfield**: `final readonly class` para VOs y DTOs. `final readonly` por defecto, abre herencia (quitar `final`) solo con razón clara.

### Readonly properties vs readonly class

```php
// ❌ verbosidad innecesaria pre-8.2
final class Money {
    public function __construct(
        public readonly int $amount,
        public readonly Currency $currency,
    ) {}
}

// ✅ 8.2+
final readonly class Money {
    public function __construct(public int $amount, public Currency $currency) {}
}
```

Usa `readonly` solo en propiedades individuales cuando la clase mezcla campos inmutables con otros que sí mutan (raro en hex — si la clase tiene state mutable, probablemente es entity, no VO).

## Enums backed para tipos cerrados de dominio

Los enums backed (PHP 8.1+) son el mecanismo canónico para conjuntos cerrados de dominio: Status, Role, Currency, Priority, OrderState.

```php
enum OrderStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::Delivered, self::Cancelled => true,
            default => false,
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return match ([$this, $next]) {
            [self::Pending, self::Confirmed], [self::Pending, self::Cancelled],
            [self::Confirmed, self::Shipped], [self::Confirmed, self::Cancelled],
            [self::Shipped, self::Delivered] => true,
            default => false,
        };
    }
}
```

Reglas:

- **`string` backed** (no `int`) para legibilidad en logs/DB salvo razón concreta para `int`.
- **`match` exhaustivo** sin `default` cuando sea posible — el compilador no falla pero PHPStan/Psalm sí marcan casos faltantes.
- **Métodos en el enum** para invariantes / transiciones — la lógica del state machine vive con el enum, no en services dispersos.
- **`OrderStatus::from(...)` / `tryFrom(...)`** para construir desde strings externos (DB, request) — `tryFrom` cuando "no match" es legítimo.

Anti-pattern: **magic constants** (`const STATUS_PENDING = 'pending'`) o constantes scattered en clases. Eso era el workaround pre-8.1 — en greenfield, enum.

## Constructor promotion + `final` por default

Combinación canónica:

```php
final class CreateOrderUseCase
{
    public function __construct(
        private OrderRepository $orders,
        private InventoryService $inventory,
        private EventDispatcher $events,
    ) {}

    public function execute(CreateOrderInput $input): Order { /* ... */ }
}
```

Reglas:

- **`final`** por default. Abrir herencia solo con razón documentada (testing puede usar mocks tipados sin necesitar `non-final`).
- **Constructor promotion** para todas las deps. No `protected $deps` + asignación en el body.
- **Visibility explícita** (`private` típicamente para deps inyectadas). Sin `public` salvo cuando se quiere accesible desde tests específicos.
- **`readonly` para VOs/DTOs**, no necesariamente para services (que típicamente son stateless y la inmutabilidad no aporta).

## Named arguments para constructors largos

Cuando un constructor tiene >3-4 parámetros del mismo tipo (típico de DTOs):

```php
$user = new UserData(
    id: '42',
    email: 'angel@example.com',
    name: 'Angel',
    role: UserRole::Admin,
    locale: 'es',
);
```

Más legible que el orden posicional. Errores de orden no compilan. Especialmente útil para DTOs con muchos opcionales.

## Exception hierarchy por capa

Tres bases abstractas, una por capa:

```php
namespace App\Domain;
abstract class DomainException extends \DomainException {}

namespace App\Application;
abstract class ApplicationException extends \RuntimeException {}

namespace App\Infrastructure;
abstract class InfrastructureException extends \RuntimeException {}
```

Concretas por error específico:

```php
namespace App\Domain\Pricing;

final class InvalidMoneyException extends DomainException {
    public static function negative(int $amount): self {
        return new self("amount must be non-negative, got {$amount}");
    }
}
```

Reglas:

- **NUNCA `throw new \Exception(...)`** en greenfield. Siempre una clase concreta tipada.
- **NUNCA `throw new \RuntimeException(...)`** salvo en infrastructure muy bajo (factory de errors de filesystem, e.g.).
- **Named constructors** (`static function negative(...)`) para errores con argumentos — mejor que pasar mensajes formateados in-line.
- **Captura por base de capa** cuando quieres tratar "cualquier error de dominio" igual (HTTP boundary que mapea `DomainException → 422`).

## Result types vs exceptions — cuándo cada uno

Default: **exceptions** para errores de invariante o del sistema. **Result types** (custom o paquetes como `cuyz/valinor`, `crell/serde`) cuando el "error" es parte del happy path del dominio.

```php
// ✅ excepción para invariante violado (debería ser imposible si todo está bien)
final readonly class Order {
    public function ship(): self {
        if ($this->status !== OrderStatus::Confirmed) {
            throw new InvalidOrderTransitionException(...);
        }
        return new self(/* shipped */);
    }
}

// ✅ Result-style cuando el "error" es esperado (input usuario, validación de dominio compleja)
final readonly class CreateOrderResult {
    public function __construct(
        public ?Order $order,
        public ?CreateOrderError $error,
    ) {}
    public function isOk(): bool { return $this->order !== null; }
}
```

Híbridos pragmáticos:

- Algunos proyectos usan **tagged unions** simulados con dos clases (`OrderCreated`, `OrderCreationFailed`) extendiendo una interface.
- Otros un `Either<L, R>` custom.

No hay paquete dominante. Si el proyecto no tiene uno definido, **exceptions tipadas + DomainException base** cubre el 90% de los casos sin importar deps externas.

## PHPDoc generics para colecciones tipadas

PHP no tiene generics nativos (RFC en evolución). Larastan/Psalm/PHPStan los entienden via PHPDoc:

```php
/**
 * @template T of Entity
 */
abstract class Repository
{
    /**
     * @return list<T>
     */
    abstract public function all(): array;

    /**
     * @return T|null
     */
    abstract public function findById(string $id): ?Entity;
}

/**
 * @extends Repository<User>
 */
final class UserRepository extends Repository { /* ... */ }
```

Reglas:

- **`list<T>`** (índices 0..n contiguos) en vez de `array<int, T>` cuando no hay sparse indices — Larastan/PHPStan lo distinguen.
- **`array<K, V>`** para mapas con shape conocida.
- **`array{name: string, email: string}`** array shape para DTOs ad-hoc.
- **`@template`** + **`@extends`** para parametrizar repositorios y value collections.

Baseline mínimo: **PHPStan/Larastan level 8** en greenfield. Level 9 si el equipo tolera estricto absoluto desde el primer día.

## Anti-patterns

- **`mixed` en signatures públicas**. `mixed` es boundary de input (request body), nunca return de un método de dominio o application. Si lo ves en return de domain/app, falta tipo.
- **`array` sin shape**. `function getUser(): array` es un olor — devuelve `UserData` (readonly class) o anota `array{id: string, name: string}`.
- **`\stdClass`** como DTO. Es el "anti-DTO" — no tiene tipo, no tiene constructor, no tiene invariantes. Usa readonly class.
- **Getters/setters auto-generados sin invariantes**. Si `setEmail($email)` no valida ni emite evento, el property público + readonly equivale en menos código.
- **`null` como flag de estado**. `$user->confirmedAt === null ? 'pending' : 'confirmed'`. Mejor enum `UserStatus` explícito.
- **`throw new \Exception(...)`** o `\RuntimeException` genérico. Siempre clase concreta de la jerarquía de capa.
- **`mixed`/`array` en domain interfaces**. Las firmas de los puertos son contrato — tipos concretos siempre.
- **Catch-all `catch (\Throwable $e)`** que tragan errores sin re-throw o log estructurado. Catch específico o propaga.
- **`is_string($x) && strlen($x) > 0`** en vez de **value object** (`NonEmptyString`). Si lo haces más de dos veces, hay un VO escondido.
- **`new SomeService()` en domain/application** que dependa de I/O. Eso es la firma de un puerto faltante.
- **PHPStan ignorando errores con `@phpstan-ignore`** repetidamente. Cada ignore es una decisión técnica — documentar con comentario o eliminar la causa.

## Referencias

- [PHP · readonly properties](https://www.php.net/manual/en/language.oop5.properties.php) — semántica oficial.
- [RFC · Readonly classes (8.2)](https://wiki.php.net/rfc/readonly_classes) — motivación y limitaciones.
- [PHP 8.2 release · readonly](https://www.php.net/releases/8.2/en.php) — release notes.
- [Stitcher.io · Readonly classes in PHP 8.2](https://stitcher.io/blog/readonly-classes-in-php-82) — Brent Roose (PHP core), patterns prácticos.
- [Stitcher.io · PHP enums](https://stitcher.io/blog/php-enums) — backed enums + methods.
- [PHPStan · Generics](https://phpstan.org/blog/generics-in-php-using-phpdocs) — `@template`, `@extends`, `list<T>`.
- [Larastan](https://github.com/larastan/larastan) — PHPStan + Laravel-aware rules.
