# schema-fns

Composable schema functions for input transformation and validation.

## Install

```sh
npm install schema-fns
```

ESM only; Node 22+.

## Overview

Build schemas by composing `Validator` instances. Every primitive (`type`,
`required`, `string.url`, `number.min`, etc.) returns a `Validator`. `schema()`,
`key()`, and `items()` compose validators into larger ones.

```js
import {
  schema, key, required, type, string, number,
} from "schema-fns";

const UserSchema = schema(
  type(Object),
  key("name", required(), string.minLength(1), string.maxLength(100)),
  key("age", required(), number.integer(), number.nonNegative()),
);

const result = UserSchema.validate({ name: "Alice", age: 30 });
result.valid; // true
result.value; // { name: "Alice", age: 30 }
```

## `Validator`

Every primitive returns a `Validator`. A schema is just a `Validator` built from
other validators.

### `.validate(value)` / `.validateAsync(value)`

Returns a `ValidationResult`. On success, `{ valid: true, value }`. On failure,
`{ valid: false, errors }`. `errors` is an array of `ValidationError` (or
subclass) instances, each with a `path` describing where in the input the
failure happened.

### `.test(value)` / `.testAsync(value)`

Returns a boolean.

### `.assert(value)` / `.assertAsync(value)`

Returns the successful `ValidationResult`, or throws a `ValidationError` whose
`.errors` is the full error list.

### `.message(stringOrFunction)`

Replaces the default message on any error the validator produces. Chainable;
returns `this`.

```js
const Age = number.integer().message("Age must be a whole number.");
```

With a function, you get access to the full error for interpolation:

```js
const Min = minLength(3).message(
  (error) => `must be at least ${error.details.minLength} characters`,
);
```

## Composing schemas

### `schema(...validators)`

Runs each validator in order. Accumulates errors; returns the transformed
`value` if all pass.

### `key(name, ...validators)`

Focuses on a property of an object. Errors are emitted with `path = [name,
...inner.path]`.

### `items(...validators)`

Validates every item in an array. Errors are emitted with `path = [index,
...inner.path]`. Fails if the value isn't an array.

### `hasKey(name)`

Requires a key to be present (with a non-`undefined` value). Supports string or
symbol keys. Throws `MissingKeyError`.

## Presence

### `required(...validators)`

Fails (`RequiredError`) if the value is missing. Missing means `null`,
`undefined`, `NaN`, empty string, length-0 array/string, size-0 Map/Set, or any
value `isEmpty()` treats as empty. If present, runs the inner validators.

### `optional(...validators)`

Passes without running inner validators if the value is `undefined`, `null`, or
`""`. Otherwise runs them.

### `isEmpty(value)`

Primitives are never empty. Arrays/strings check `.length`. Maps/Sets check
`.size`. Iterables check for any item. Plain objects check for any enumerable
property.

## Types

### `type(Type)`

Passes if the value matches `Type`. Accepts:

- strict equality (for `null`/`undefined`)
- `value instanceof Type` (for classes)
- `typeof value === Type` (for strings like `"string"`)
- `typeof value === Type.name.toLowerCase()` (for primitive constructors like
  `String`, `Number`)

Throws `WrongTypeValidationError`.

### `type.oneOf(...Types)`

Passes if `value instanceof` any of the given types.

### `type.to(Type)`

Coerces the value to a target type. Built-in conversions for `Array`, `BigInt`,
`Boolean`, `Date`, `Function`, `Map`, `Number`, `Object`, `Promise`, `RegExp`,
`Set`, `String`, `Symbol`, `Uint8Array`. Unknown types are called as
`Type(value)`.

```js
const parseAge = type.to(Number);
parseAge.validate("42").value; // 42
```

### `oneOf(...values)`

Passes if `value` is included in the given values.

## Strings

```js
string();                 // type(String)
string.minLength(n);      // throws MinimumStringLengthError
string.maxLength(n);      // throws MaximumStringLengthError
string.url();             // throws InvalidURLError
string.email();           // throws InvalidEmailError
string.isoDate();         // throws InvalidISODateError (YYYY-MM-DD)
```

`string.url()` accepts bare domains (`"example.com"`), rejects IPs and unlisted
domains. `string.isoDate()` rejects format mismatches and invalid calendar dates
(e.g. `2024-02-30`).

## Numbers

```js
number();                 // type(Number)
number.min(n);            // throws MinimumNumberError
number.max(n);            // throws MaximumNumberError
number.finite();          // throws FiniteNumberError
number.integer();         // throws NonIntegerError
number.positive();        // > 0, throws PositiveNumberError
number.nonNegative();     // >= 0, throws NonNegativeNumberError
```

`number.*` bound checks accept cleanly-coercible strings so form inputs work
without a preceding `type.to(Number)`. `"5"` and `" 5 "` pass; `""`, `"abc"`,
`"5abc"`, `NaN`, `Infinity`, `null`, `undefined`, booleans, arrays, and plain
objects are rejected. Values pass through unchanged. Use `type.to(Number)` if
you want the output transformed.

## Length

### `minLength(n)`

Generic length check; works on any value with a numeric `.length`. Throws
`MinLengthError`. Distinct from `string.minLength`, which also asserts
string-specific behavior.

## Custom validators

Subclass `Validator` or pass a function to its constructor. Throw a
`ValidationError` (or subclass) to fail validation. Any other thrown value
bubbles out of `.validate()`.

```js
import { Validator, ValidationError } from "schema-fns";

const evenNumber = new Validator((value) => {
  if (value % 2 !== 0) {
    throw new ValidationError({
      message: "Must be even",
      details: { value },
    });
  }
});
```

## Transforms

A `Validator`'s function can return a new value. Whatever it returns (if not
`undefined`) replaces the input; returning `undefined` leaves the input
unchanged.

```js
const upper = new Validator((value) => value.toUpperCase());
upper.validate("hi").value; // "HI"
```

## Errors

All errors subclass `ValidationError`:

```
ValidationError
├── RequiredError
├── MinLengthError
├── MinimumStringLengthError
├── MaximumStringLengthError
├── MissingKeyError
├── WrongTypeValidationError
├── InvalidURLError
├── InvalidEmailError
├── InvalidISODateError
├── MinimumNumberError
├── MaximumNumberError
├── FiniteNumberError
├── NonIntegerError
├── PositiveNumberError
└── NonNegativeNumberError
```

Every error has a `path` describing its location in the input, and may carry a
`details` object with context (`value`, `minLength`, etc.).

## Migrating from 0.1.x

`1.0.0` is a breaking rewrite on top of a `Validator` class. No backwards-compat
shims.

| 0.1.x                            | 1.0.0                                             |
| -------------------------------- | ------------------------------------------------- |
| `isType(T)` / `is(T)`            | `type(T)`                                         |
| `as(T)` / `to(T)`                | `type.to(T)`                                      |
| `isOneOf(...v)`                  | `oneOf(...v)`                                     |
| `isUrl()`                        | `string.url()`                                    |
| `length(min, max)`               | `string.minLength(min)` + `string.maxLength(max)` |
| `hasKeys(...keys)`               | `hasKey(key)` (one per call)                      |
| `(value, update, error)` handler | `new Validator(fn)` / plain `fn` in `schema()`    |
| `mapAdapter(fn)`                 | `new Validator(fn)`                               |
| error objects with `code`        | `ValidationError` subclass instances              |

The handler shape changed. Instead of calling `update()` and `error()`, return
the transformed value (or `undefined` to leave it alone) and throw
`ValidationError` instances to fail.

## Credits

Inspired by [Joi](https://joi.dev/api/) and
[superstruct](https://docs.superstructjs.org/).
