import test from "node:test";
import assert from "node:assert/strict";
import {
  ValidationError, ValidationResult, Validator,
  schema, key, items, hasKey, MissingKeyError,
  required, RequiredError, optional,
  minLength, MinLengthError,
  type, WrongTypeValidationError,
  oneOf,
  string, MinimumStringLengthError, MaximumStringLengthError,
  InvalidURLError, InvalidEmailError, InvalidISODateError,
  number, MinimumNumberError, MaximumNumberError,
  FiniteNumberError, NonIntegerError,
  PositiveNumberError, NonNegativeNumberError,
  isEmpty,
  mapAdapter,
} from "./schema.js";


await test("ValidationError", async () => {
  const error = new ValidationError({ message: "Invalid value" });
  assert.equal(error.message, "Invalid value");
  assert.deepEqual(error.path, []);

  const stringForm = new ValidationError("Bad input", { code: "x" });
  assert.equal(stringForm.message, "Bad input");
  assert.equal(stringForm.code, "x");
});


await test("ValidationResult", async (t) => {
  await t.test(".ok()", () => {
    const result = ValidationResult.ok("valid data");
    assert.equal(result.valid, true);
    assert.equal(result.value, "valid data");
    assert.equal("errors" in result, false);
  });

  await t.test(".error()", () => {
    const errs = [
      new ValidationError({ message: "Error 1" }),
      new ValidationError({ message: "Error 2" }),
    ];
    const result = ValidationResult.error(errs);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, errs);
    assert.equal("value" in result, false);
  });

  await t.test("constructor asserts boolean valid", () => {
    assert.throws(
      () => new ValidationResult({ valid: "yes", value: 1 }),
      TypeError,
    );
  });
});


await test("Validator", async (t) => {
  function createValidator() {
    return new Validator((value) => {
      if (value < 0) {
        throw new ValidationError({ message: "Value must be non-negative" });
      }
    });
  }

  function createAsyncValidator() {
    return new Validator(async (value) => {
      if (value < 0) {
        throw new ValidationError("Value must be non-negative");
      }
    });
  }

  await t.test("constructor throws on non-function", () => {
    assert.throws(() => new Validator("not a function"), TypeError);
    assert.throws(() => new Validator(42), TypeError);
  });

  await t.test(".validate() with valid input returns a valid result", () => {
    const result = createValidator().validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });

  await t.test(".validate() with invalid input returns an invalid result", () => {
    const result = createValidator().validate(-2);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors.at(0).message, "Value must be non-negative");
  });

  await t.test(".message() with a string overrides the error message", () => {
    const result = createValidator().message("Custom message").validate(-3);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0).message, "Custom message");
  });

  await t.test(".message() with a function overrides the error message", () => {
    const result = createValidator().message(() => "From fn").validate(-3);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0).message, "From fn");
  });

  await t.test(".validateAsync() with valid input", async () => {
    const result = await createAsyncValidator().validateAsync(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });

  await t.test(".validateAsync() with invalid input", async () => {
    const result = await createAsyncValidator().validateAsync(-2);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
  });

  await t.test(".test() returns boolean validity", () => {
    const v = createValidator();
    assert.equal(v.test(5), true);
    assert.equal(v.test(-2), false);
  });

  await t.test(".testAsync() returns boolean validity", async () => {
    const v = createAsyncValidator();
    assert.equal(await v.testAsync(5), true);
    assert.equal(await v.testAsync(-2), false);
  });

  await t.test(".assert() with valid input doesn't throw", () => {
    assert.doesNotThrow(() => createValidator().assert(5));
  });

  await t.test(".assert() with invalid input throws", () => {
    assert.throws(() => createValidator().assert(-2), ValidationError);
  });

  await t.test(".assertAsync() with valid input doesn't throw", async () => {
    await assert.doesNotReject(() => createAsyncValidator().assertAsync(5));
  });

  await t.test(".assertAsync() with invalid input throws", async () => {
    await assert.rejects(
      () => createAsyncValidator().assertAsync(-2),
      ValidationError,
    );
  });

  await t.test("non-ValidationError throws bubble up", () => {
    const v = new Validator(() => { throw new RangeError("boom"); });
    assert.throws(() => v.validate(null));
  });
});


await test("schema()", async (t) => {
  await t.test("with valid input", () => {
    const Name = schema(required(), minLength(3));
    const result = Name.validate("Alice");
    assert.equal(result.valid, true);
    assert.equal(result.value, "Alice");
  });

  await t.test("accepts both plain functions and Validator instances", () => {
    const plainFn = (v) => {
      if (v !== "ok") throw new ValidationError("not ok");
    };
    const vld = new Validator((v) => {
      if (typeof v !== "string") throw new ValidationError("not string");
    });
    const S = schema(plainFn, vld);
    assert.equal(S.validate("ok").valid, true);
    assert.equal(S.validate("nope").valid, false);
  });

  await t.test("throws TypeError on non-function argument", () => {
    assert.throws(() => schema("not a fn"), TypeError);
  });
});


await test("key()", async (t) => {
  const UserSchema = schema(
    key("username", required(), minLength(3)),
    key("age", required()),
  );

  await t.test("with valid input", () => {
    const result = UserSchema.validate({ username: "alice", age: 30 });
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, { username: "alice", age: 30 });
  });

  await t.test("with missing key surfaces errors with paths", () => {
    const result = UserSchema.validate({ age: 30 });
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof RequiredError, true);
    assert.deepEqual(result.errors.at(0).path, ["username"]);
  });

  await t.test("nested key()s with valid input", () => {
    const Nested = schema(key("foo", key("bar", required())));
    const result = Nested.validate({ foo: { bar: 42 } });
    assert.equal(result.valid, true);
  });

  await t.test("nested key()s propagate path", () => {
    const Nested = schema(key("foo", key("bar", required())));
    const result = Nested.validate({ foo: {} });
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.at(0).path, ["foo", "bar"]);
  });
});


await test("items()", async (t) => {
  function allCaps() {
    return new Validator((value) => {
      if (value !== value.toUpperCase()) {
        throw new ValidationError("Value must be all caps");
      }
    });
  }

  const ListSchema = schema(items(allCaps()));

  await t.test("with valid input", () => {
    const result = ListSchema.validate(["FOO", "BAR", "BAZ"]);
    assert.equal(result.valid, true);
  });

  await t.test("with invalid input at index 1", () => {
    const result = ListSchema.validate(["FOO", "Bar", "BAZ"]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.at(0).path, [1]);
  });

  await t.test("rejects non-arrays", () => {
    const result = ListSchema.validate("not an array");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof ValidationError, true);
  });
});


await test("hasKey()", async (t) => {
  const UserSchema = schema(hasKey("username"));

  await t.test("with key present", () => {
    const result = UserSchema.validate({ username: "alice" });
    assert.equal(result.valid, true);
  });

  await t.test("with key missing", () => {
    const result = UserSchema.validate({ name: "alice" });
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof MissingKeyError, true);
  });

  await t.test("with symbol key", () => {
    const sym = Symbol("k");
    const S = schema(hasKey(sym));
    assert.equal(S.validate({ [sym]: 1 }).valid, true);
    assert.equal(S.validate({}).valid, false);
  });

  await t.test("throws TypeError if key isn't a string or symbol", () => {
    assert.throws(() => hasKey(123), TypeError);
  });
});


await test("required()", async (t) => {
  await t.test("with valid values", () => {
    const v = required();
    assert.equal(v.validate("hello").valid, true);
    assert.equal(v.validate(0).valid, true);
    assert.equal(v.validate(false).valid, true);
    assert.equal(v.validate(true).valid, true);
  });

  await t.test("with invalid values", () => {
    const v = required();
    assert.equal(v.validate(undefined).valid, false);
    assert.equal(v.validate(null).valid, false);
    assert.equal(v.validate("").valid, false);
    assert.equal(v.validate([]).valid, false);
    assert.equal(v.validate({}).valid, false);
    assert.equal(v.validate(NaN).valid, false);
  });

  await t.test("with nested validators", async (tt) => {
    const S = schema(
      required(type(Object), key("foo", string.minLength(3))),
    );

    await tt.test("valid input passes", () => {
      assert.equal(S.validate({ foo: "bar" }).valid, true);
    });

    await tt.test("missing value throws RequiredError, inner skipped", () => {
      const result = S.validate(null);
      assert.equal(result.valid, false);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors.at(0) instanceof RequiredError, true);
    });

    await tt.test("present but invalid runs inner validators", () => {
      const result = S.validate({ foo: "hi" });
      assert.equal(result.valid, false);
      assert.equal(result.errors.at(0) instanceof MinimumStringLengthError, true);
      assert.deepEqual(result.errors.at(0).path, ["foo"]);
    });
  });
});


await test("optional()", async (t) => {
  const S = schema(optional(string.minLength(5)));

  await t.test("empty values pass", () => {
    assert.equal(S.validate(undefined).valid, true);
    assert.equal(S.validate(null).valid, true);
    assert.equal(S.validate("").valid, true);
  });

  await t.test("non-empty valid value passes", () => {
    assert.equal(S.validate("hello").valid, true);
  });

  await t.test("non-empty invalid value fails", () => {
    assert.equal(S.validate("hi").valid, false);
  });
});


await test("type()", async (t) => {
  await t.test("with valid input", () => {
    assert.equal(type(Object).validate({}).valid, true);
    assert.equal(type(Number).validate(42).valid, true);
    assert.equal(type(Array).validate([]).valid, true);
    assert.equal(type(String).validate("s").valid, true);
    assert.equal(type("string").validate("s").valid, true);
  });

  await t.test("with invalid input", () => {
    assert.equal(type(Object).validate("hi").valid, false);
    assert.equal(type(Number).validate({}).valid, false);
    const result = type(Object).validate("hi");
    assert.equal(
      result.errors.at(0) instanceof WrongTypeValidationError,
      true,
    );
  });
});


await test("type.oneOf()", async (t) => {
  class A {}
  class B {}
  class C {}

  const S = schema(type.oneOf(A, B, C));

  await t.test("with valid input", () => {
    assert.equal(S.validate(new A()).valid, true);
    assert.equal(S.validate(new B()).valid, true);
    assert.equal(S.validate(new C()).valid, true);
  });

  await t.test("with invalid input", () => {
    assert.equal(S.validate("hello").valid, false);
    assert.equal(S.validate(null).valid, false);
    assert.equal(S.validate(undefined).valid, false);
  });
});


await test("type.to()", async (t) => {
  await t.test("to Boolean", () => {
    assert.equal(type.to(Boolean).validate("foo").value, true);
    assert.equal(type.to(Boolean).validate("").value, false);
  });

  await t.test("to String", () => {
    assert.equal(type.to(String).validate(42).value, "42");
    assert.equal(type.to(String).validate(0).value, "0");
    assert.equal(type.to(String).validate([1, 2, 3]).value, "1,2,3");
  });

  await t.test("numeric string to Number", () => {
    const r = type.to(Number).validate("42");
    assert.equal(r.valid, true);
    assert.equal(r.value, 42);
  });

  await t.test("non-numeric string to Number is NaN but still valid", () => {
    const r = type.to(Number).validate("not-a-number");
    assert.equal(r.valid, true);
    assert.equal(Number.isNaN(r.value), true);
  });

  await t.test("to Object wraps null", () => {
    const r = type.to(Object).validate(null);
    assert.deepEqual(r.value, {});
  });

  await t.test("to Array", () => {
    const r = type.to(Array).validate("foo");
    assert.deepEqual(r.value, ["f", "o", "o"]);
  });

  await t.test("to Date", () => {
    const r = type.to(Date).validate("2021-01-01");
    assert.equal(r.value instanceof Date, true);
    assert.equal(Number.isNaN(r.value.getTime()), false);
  });

  await t.test("to BigInt", () => {
    const r = type.to(BigInt).validate("42");
    assert.equal(r.value, 42n);
  });

  await t.test("unsupported type throws TypeError", () => {
    assert.throws(() => type.to("banana"), TypeError);
  });
});


await test("oneOf()", async (t) => {
  const S = schema(oneOf("red", "green", "blue"));

  await t.test("with valid input", () => {
    assert.equal(S.validate("red").valid, true);
    assert.equal(S.validate("green").valid, true);
  });

  await t.test("with invalid input", () => {
    const result = S.validate("yellow");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof ValidationError, true);
  });
});


await test("minLength() (generic)", async (t) => {
  await t.test("with valid values", () => {
    const v = minLength(5);
    assert.equal(v.validate("hello").valid, true);
    assert.equal(v.validate(["h", "e", "l", "l", "o"]).valid, true);
  });

  await t.test("with invalid values", () => {
    const v = minLength(5);
    assert.equal(v.validate("hi").valid, false);
    assert.equal(v.validate(["h", "i"]).valid, false);
  });

  await t.test("with message override reading details", () => {
    const v = minLength(3).message(
      (error) => `Must be at least ${error.details.minLength} chars`,
    );
    const result = v.validate("a");
    assert.equal(result.errors.at(0).message, "Must be at least 3 chars");
  });

  await t.test("rejects values without numeric length", () => {
    const v = minLength(3);
    assert.equal(v.validate(42).valid, false);
  });
});


await test("string.minLength()", async () => {
  const S = schema(string.minLength(3));
  assert.equal(S.validate("hello").valid, true);
  const result = S.validate("hi");
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MinimumStringLengthError, true);
});


await test("string.maxLength()", async () => {
  const S = schema(string.maxLength(5));
  assert.equal(S.validate("hello").valid, true);
  const result = S.validate("hello world");
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MaximumStringLengthError, true);
});


await test("string.url()", async (t) => {
  const S = schema(string.url());

  await t.test("bare domain", () => {
    assert.equal(S.validate("example.com").valid, true);
  });

  await t.test("full URL", () => {
    assert.equal(S.validate("https://example.com/path").valid, true);
  });

  await t.test("URL with port", () => {
    assert.equal(S.validate("https://example.com:8080").valid, true);
  });

  await t.test("subdomain accepted", () => {
    assert.equal(S.validate("api.example.com").valid, true);
  });

  await t.test("IP address rejected", () => {
    assert.equal(S.validate("192.168.1.1").valid, false);
  });

  await t.test("localhost rejected (not listed public domain)", () => {
    assert.equal(S.validate("localhost").valid, false);
  });

  await t.test("empty string rejected", () => {
    const result = S.validate("");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof InvalidURLError, true);
  });

  await t.test("garbage rejected", () => {
    assert.equal(S.validate("not-a-url").valid, false);
  });
});


await test("string.email()", async (t) => {
  const S = schema(string.email());

  await t.test("with valid input", () => {
    assert.equal(S.validate("user@example.com").valid, true);
  });

  await t.test("with invalid inputs", () => {
    const invalid = [
      "not-an-email",
      "user@example",
      "user@example.",
      "user@.com",
      "@example.com",
      "user@",
      "@",
      "example.com",
      "user@examplecom",
      "@user@example.com",
      "",
      null,
      undefined,
    ];
    for (const v of invalid) {
      assert.equal(S.validate(v).valid, false, `expected invalid: ${v}`);
    }
    const result = S.validate("bad");
    assert.equal(result.errors.at(0) instanceof InvalidEmailError, true);
  });
});


await test("string.isoDate()", async (t) => {
  const S = schema(string.isoDate());

  await t.test("valid dates", () => {
    assert.equal(S.validate("2024-01-01").valid, true);
    assert.equal(S.validate("2024-12-31").valid, true);
    assert.equal(S.validate("2024-02-29").valid, true); // leap year
    assert.equal(S.validate("2023-08-22").valid, true);
  });

  await t.test("invalid format", () => {
    assert.equal(S.validate("2024-1-1").valid, false);
    assert.equal(S.validate("24-01-01").valid, false);
    assert.equal(S.validate("2024/01/01").valid, false);
    assert.equal(S.validate("").valid, false);
    assert.equal(S.validate("08/22/2023").valid, false);
    assert.equal(S.validate("22-08-2023").valid, false);
    const result = S.validate("");
    assert.equal(result.errors.at(0) instanceof InvalidISODateError, true);
  });

  await t.test("invalid rollover dates rejected", () => {
    assert.equal(S.validate("2024-02-30").valid, false);
    assert.equal(S.validate("2024-13-01").valid, false);
    assert.equal(S.validate("2023-02-29").valid, false); // non-leap
    assert.equal(S.validate("2023-12-32").valid, false);
    assert.equal(S.validate("2024-04-31").valid, false);
    assert.equal(S.validate("2023-22-08").valid, false);
  });

  await t.test("non-string rejected", () => {
    assert.equal(S.validate(42).valid, false);
    assert.equal(S.validate(null).valid, false);
  });
});


await test("number.min()", async () => {
  const S = schema(number.min(10));
  assert.equal(S.validate(15).valid, true);
  const result = S.validate(5);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MinimumNumberError, true);
});


await test("number.max()", async () => {
  const S = schema(number.max(20));
  assert.equal(S.validate(15).valid, true);
  const result = S.validate(25);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MaximumNumberError, true);
});


await test("number.finite()", async () => {
  const S = schema(number.finite());
  assert.equal(S.validate(42).valid, true);
  const result = S.validate(Infinity);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof FiniteNumberError, true);
});


await test("number.integer()", async () => {
  const S = schema(number.integer());
  assert.equal(S.validate(42).valid, true);
  const result = S.validate(42.5);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof NonIntegerError, true);
});


await test("number.positive()", async () => {
  const S = schema(number.positive());
  assert.equal(S.validate(42).valid, true);
  assert.equal(S.validate(0).valid, false);
  assert.equal(S.validate(-5).valid, false);
  const result = S.validate(0);
  assert.equal(result.errors.at(0) instanceof PositiveNumberError, true);
});


await test("number.nonNegative()", async () => {
  const S = schema(number.nonNegative());
  assert.equal(S.validate(42).valid, true);
  assert.equal(S.validate(0).valid, true);
  assert.equal(S.validate(-5).valid, false);
  const result = S.validate(-1);
  assert.equal(result.errors.at(0) instanceof NonNegativeNumberError, true);
});


await test("isEmpty()", async (t) => {
  await t.test("primitives are never empty", () => {
    assert.equal(isEmpty(0), false);
    assert.equal(isEmpty(false), false);
    assert.equal(isEmpty("x"), false);
    assert.equal(isEmpty(42), false);
  });

  await t.test("strings/arrays use .length", () => {
    assert.equal(isEmpty(""), false); // string is primitive
    assert.equal(isEmpty([]), true);
    assert.equal(isEmpty([1]), false);
  });

  await t.test("Maps/Sets use .size", () => {
    assert.equal(isEmpty(new Map()), true);
    assert.equal(isEmpty(new Map([["a", 1]])), false);
    assert.equal(isEmpty(new Set()), true);
    assert.equal(isEmpty(new Set([1])), false);
  });

  await t.test("plain objects check enumerable properties", () => {
    assert.equal(isEmpty({}), true);
    assert.equal(isEmpty({ a: 1 }), false);
  });
});


await test("mapAdapter()", async (t) => {
  await t.test("returns a Validator", () => {
    const v = mapAdapter((x) => x * 2);
    assert.equal(v instanceof Validator, true);
  });

  await t.test("transforms the value when fn returns non-undefined", () => {
    const v = mapAdapter((x) => x * 2);
    const result = v.validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 10);
  });

  await t.test("passes value through when fn returns undefined", () => {
    const v = mapAdapter(() => undefined);
    const result = v.validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });
});
