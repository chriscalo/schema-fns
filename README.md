# schema-fns
Composable schema functions for input transformation and validation

## Installation

``` sh
yarn add schema-fns
# or
npm install schema-fns
```

## Overview

`schema-fns` lets you build composable schemas for input transformation and
validation. The most important export is the `schema()` function that's used to
define schemas. It's modeled after the Express middleware model of layers of
handler functions and therefore accepts as parameters any number of functions or
schema objects. Those functions have a signature of `(value, update, error)`,
where:
- `value` is the input value to be transformed and validated, 
- `update` is a function used to return a modified input value, and
- `error` is a function used to create.

## Input transformation

Let's see it in action. The first thing you can do with `schema-fns` is
transform input. The following example uses two transformation functions, one
to convert the value to a string, and another to append a `"1"`. Given the input
`42`, the value becomes `"421"`:

``` js
const { schema } = require("schema-fns");

const MySchema = schema(
  function (value, update, error) {
    update(String(value));
  },
  function (value, update, error) {
    update(value + "1");
  },
);

const { value } = MySchema.validate(42);
console.log(value); //=> "421"
```

For simple value tranformations, there's an adapter function `mapAdapter()` that
converts mapping functions to a form that works for `schema-fns`. The same
example above can be written as:

``` js
const { schema, mapAdapter } = require("schema-fns");

const MySchema = schema(
  mapAdapter(value => String(value)),
  mapAdapter(value => value + "1"),
);

const { value } = MySchema.validate(42);
console.log(value); //=> "421"
```

## Input validation

The next interesting thing you can do is validate input values. And the simplest
way is to use built-in validation functions. Calling `.validate(input)` returns
an object with:
- `valid`: `true` if there were no validation errors, `false` otherwise
- `value`: the transformed value
- `errors`: an array of any validation errors

### `.validate(value)`

Here's an example that validates that a value is an object.

``` js
const { schema, is } = require("schema-fns");

const MySchema = schema(
  is(Object),
);

const { valid, value, errors } = MySchema.validate(42);
console.log(valid); //=> false
console.log(value); //=> 42 (because the value was never updated)
```

The `errors` array will look like the following:

``` js
[{
  code: "is.type", // the validation error code
  path: [], // path taken to get from the input to the value where the error happened
  message: "wrong type: expected object", // the default
  value: 42, // the value validated
  expectedType: "object", // each validator may include additional context
}]
```

### `.test(value)`

In addition to `.validate()`, there is a `.test()` function that just returns
the value of `valid`:

``` js
const { schema, is } = require("schema-fns");

const MySchema = schema(
  is(Object),
);

console.log(MySchema.test(42)); //=> false
console.log(MySchema.test({})); //=> true
console.log(MySchema.test("hi")); //=> false
```

### `.assert(value)`

Finally, if instead of receiving the transformed value and errors, `.assert()`
will throw an error if validation fails:

``` js
const { schema, is } = require("schema-fns");

const MySchema = schema(
  is(Object),
);

MySchema.assert(42); // throws
MySchema.assert("hi"); // throws
MySchema.assert({}); // doesn't throw
```

### `hasKeys(...keyNames)`

Let's look at more validation functions. `hasKeys()` checks that keys are
present on some object:

``` js
const { schema, hasKeys } = require("schema-fns");

const MySchema = schema(
  hasKeys("foo", "bar"),
);

const { valid, value, errors } = MySchema.validate({});
console.log(valid); //=> false
console.log(value); //=> {}
```

The `errors` array will look like:

``` js
[{
  code: "key.missing",
  path: [],
  message: `expected key "foo" missing`,
  key: "foo",
  value: {},
}, {
  code: "key.missing",
  path: [],
  message: `expected key "bar" missing`,
  key: "bar",
  value: {},
}]
```

### `key(name, ...fns)`

The `key()` function is used to focus in on one key of an object and apply
schema functions to it. The first argument is the key name and the remaining
arguments are schema functions.

``` js
const { schema, key, mapAdapter } = require("schema-fns");

const MySchema = schema(
  key(
    "name",
    mapAdapter(value => `Hello, ${value}!`),
    mapAdapter(value => String(value).toUpperCase()),
  ),
);

const { valid, value, errors } = MySchema.validate({ name: "World" });

console.log(valid); //=> true
console.log(value); //=> { "name": "HELLO, WORLD!" }
console.log(errors); //=> []
```

It can also be used for validation:

``` js
const { schema, is, key } = require("schema-fns");

const MySchema = schema(
  key("foo", is(Object)),
);

const { valid, value, errors } = MySchema.validate({ foo: 42 });
console.log(valid); //=> false
console.log(value); //=> { foo: 42 }
```

The `errors` array will look like:

``` js
[{
  code: "is.type",
  path: ["foo"],
  message: "wrong type: expected object",
  expectedType: "object",
  value: 42,
}]
```

Of course, `key()` is recursive:

``` js
const { schema, is, key } = require("schema-fns");

const MySchema = schema(
  key(
    "name",
    is(Object),
    key("first", is(String)),
  ),
);

const { valid, value, errors } = MySchema.validate({
  name: {
    first: 42,
  },
});

console.log(valid); //=> false
console.log(value); //=> { name: { first: 42 } }
```

The `errors` array will look like:

``` js
[{
  code: "is.type",
  path: ["name", "first"],
  message: "wrong type: expected string",
  expectedType: "string",
  value: 42,
}]
```

### `items(...fns)`

The `items()` function is used to transform and validate all items in an array.
Here's a transformation example that doubles numbers in an array and then
repeats the digits:

``` js
const { schema, items, mapAdapter } = require("schema-fns");

const MySchema = schema(
  items(
    mapAdapter(value => value * 2),
    mapAdapter(value => String(value) + String(value)),
    mapAdapter(Number)
  ),
);

const { valid, value, errors } = MySchema.validate([ 1, 2, 3 ]);

console.log(valid); //=> true
console.log(value); //=> [ 22, 44, 66 ]);
```

It can be used for validation as well:

``` js
const { schema, is, items } = require("schema-fns");

const MySchema = schema(
  items(is(Number)),
);

const { valid, value, errors } = MySchema.validate([ 1, 2, "3", 4, "5" ]);

console.log(valid); //=> false
console.log(value); //=> [ 1, 2, "3", 4, "5" ]
```

The `errors` array will look like:

``` js
[{
  code: "is.type",
  path: [2],
  message: "wrong type: expected number",
  expectedType: "number",
  value: "3",
}, {
  code: "is.type",
  path: [4],
  message: "wrong type: expected number",
  expectedType: "number",
  value: "5",
}]
```


## Custom input validation

Writing custom validators is as simple as calling the `error()` function,
passing a string error code and a context object with additional information
useful for debugging or messaging to an end user.


``` js
const { schema, is, items } = require("schema-fns");

const MySchema = schema(
  notFoo(),
);

// fails validation if the value equals "foo", "FOO", etc
function notFoo() {
  return function (value, update, error) {
    if (String(value).toLowerCase() === "foo") {
      // first argument is a unique error code
      // second argument is a context object
      error("not.foo", {
        message: `not foo expected, got ${value}`,
        value,
      });
    }
  };
}

console.log(MySchema.test("foo")); //=> false
console.log(MySchema.test("fOO")); //=> false
console.log(MySchema.test("FOo")); //=> false
console.log(MySchema.test(42)); //=> true
console.log(MySchema.test({})); //=> true
```


## Credit

Inspired by [Joi](https://joi.dev/api/) and [superstruct](https://docs.superstructjs.org/).


