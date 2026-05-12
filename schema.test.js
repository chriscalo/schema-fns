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
} from "./schema.js";


await test("ValidationError", async () => {
  const error = new ValidationError({ message: "Invalid value" });
  assert.equal(error.message, "Invalid value");
  assert.deepEqual(error.path, []);
  
  const stringForm = new ValidationError("Bad input", { code: "x" });
  assert.equal(stringForm.message, "Bad input");
  assert.equal(stringForm.code, "x");
});


await test("ValidationResult", async (ctx) => {
  await ctx.test(".ok()", () => {
    const result = ValidationResult.ok("valid data");
    assert.equal(result.valid, true);
    assert.equal(result.value, "valid data");
    assert.equal("errors" in result, false);
  });
  
  await ctx.test(".error()", () => {
    const errs = [
      new ValidationError({ message: "Error 1" }),
      new ValidationError({ message: "Error 2" }),
    ];
    const result = ValidationResult.error(errs);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, errs);
    assert.equal("value" in result, false);
  });
  
  await ctx.test("constructor asserts boolean valid", () => {
    assert.throws(
      () => new ValidationResult({ valid: "yes", value: 1 }),
      TypeError,
    );
  });
});


await test("Validator", async (ctx) => {
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
  
  await ctx.test("constructor throws on non-function", () => {
    assert.throws(() => new Validator("not a function"), TypeError);
    assert.throws(() => new Validator(42), TypeError);
  });
  
  await ctx.test(".validate() with valid input returns a valid result", () => {
    const result = createValidator().validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });
  
  await ctx.test(".validate() invalid input returns invalid result", () => {
    const result = createValidator().validate(-2);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors.at(0).message, "Value must be non-negative");
  });
  
  await ctx.test(".message(string) overrides the error message", () => {
    const result = createValidator().message("Custom message").validate(-3);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0).message, "Custom message");
  });
  
  await ctx.test(".message(fn) overrides the error message", () => {
    const result = createValidator().message(() => "From fn").validate(-3);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0).message, "From fn");
  });
  
  await ctx.test(".validateAsync() with valid input", async () => {
    const result = await createAsyncValidator().validateAsync(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });
  
  await ctx.test(".validateAsync() with invalid input", async () => {
    const result = await createAsyncValidator().validateAsync(-2);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
  });
  
  await ctx.test(".test() returns boolean validity", () => {
    const vld = createValidator();
    assert.equal(vld.test(5), true);
    assert.equal(vld.test(-2), false);
  });
  
  await ctx.test(".testAsync() returns boolean validity", async () => {
    const vld = createAsyncValidator();
    assert.equal(await vld.testAsync(5), true);
    assert.equal(await vld.testAsync(-2), false);
  });
  
  await ctx.test(".assert() with valid input doesn't throw", () => {
    assert.doesNotThrow(() => createValidator().assert(5));
  });
  
  await ctx.test(".assert() with invalid input throws", () => {
    assert.throws(() => createValidator().assert(-2), ValidationError);
  });
  
  await ctx.test(".assertAsync() with valid input doesn't throw", async () => {
    await assert.doesNotReject(() => createAsyncValidator().assertAsync(5));
  });
  
  await ctx.test(".assertAsync() with invalid input throws", async () => {
    await assert.rejects(
      () => createAsyncValidator().assertAsync(-2),
      ValidationError,
    );
  });
  
  await ctx.test("non-ValidationError throws keep original type", () => {
    const vld = new Validator(() => { throw new RangeError("boom"); });
    assert.throws(() => vld.validate(null), (error) => {
      return error instanceof RangeError && error.message === "boom";
    });
  });
  
  await ctx.test("mixed throw arrays become AggregateError", () => {
    const vld = new Validator(() => {
      throw [new RangeError("a"), new ValidationError("b")];
    });
    assert.throws(() => vld.validate(null), AggregateError);
  });
  
  await ctx.test(".validate() throws TypeError on Promise return", () => {
    const asyncFn = async (value) => value;
    const vld = new Validator(asyncFn);
    assert.throws(() => vld.validate(1), TypeError);
  });
});


await test("schema()", async (ctx) => {
  await ctx.test("with valid input", () => {
    const Name = schema(required(), minLength(3));
    const result = Name.validate("Alice");
    assert.equal(result.valid, true);
    assert.equal(result.value, "Alice");
  });
  
  await ctx.test("accepts both plain functions and Validator instances", () => {
    const plainFn = (vld) => {
      if (vld !== "ok") throw new ValidationError("not ok");
    };
    const vld = new Validator((vld) => {
      if (typeof vld !== "string") throw new ValidationError("not string");
    });
    const Sch = schema(plainFn, vld);
    assert.equal(Sch.validate("ok").valid, true);
    assert.equal(Sch.validate("nope").valid, false);
  });
  
  await ctx.test("throws TypeError on non-function argument", () => {
    assert.throws(() => schema("not a fn"), TypeError);
  });
});


await test("key()", async (ctx) => {
  const UserSchema = schema(
    key("username", required(), minLength(3)),
    key("age", required()),
  );
  
  await ctx.test("with valid input", () => {
    const result = UserSchema.validate({ username: "alice", age: 30 });
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, { username: "alice", age: 30 });
  });
  
  await ctx.test("with missing key surfaces errors with paths", () => {
    const result = UserSchema.validate({ age: 30 });
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof RequiredError, true);
    assert.deepEqual(result.errors.at(0).path, ["username"]);
  });
  
  await ctx.test("nested key()s with valid input", () => {
    const Nested = schema(key("foo", key("bar", required())));
    const result = Nested.validate({ foo: { bar: 42 } });
    assert.equal(result.valid, true);
  });
  
  await ctx.test("nested key()s propagate path", () => {
    const Nested = schema(key("foo", key("bar", required())));
    const result = Nested.validate({ foo: {} });
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.at(0).path, ["foo", "bar"]);
  });
  
  await ctx.test("null value produces ValidationError, not TypeError", () => {
    const Sch = schema(key("foo", required()));
    const result = Sch.validate(null);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof WrongTypeValidationError, true);
  });
  
  await ctx.test("primitive value produces ValidationError", () => {
    const Sch = schema(key("foo", required()));
    const result = Sch.validate(42);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof WrongTypeValidationError, true);
  });
});


await test("items()", async (ctx) => {
  function allCaps() {
    return new Validator((value) => {
      if (value !== value.toUpperCase()) {
        throw new ValidationError("Value must be all caps");
      }
    });
  }
  
  const ListSchema = schema(items(allCaps()));
  
  await ctx.test("with valid input", () => {
    const result = ListSchema.validate(["FOO", "BAR", "BAZ"]);
    assert.equal(result.valid, true);
  });
  
  await ctx.test("with invalid input at index 1", () => {
    const result = ListSchema.validate(["FOO", "Bar", "BAZ"]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.at(0).path, [1]);
  });
  
  await ctx.test("rejects non-arrays", () => {
    const result = ListSchema.validate("not an array");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof ValidationError, true);
  });
});


await test("hasKey()", async (ctx) => {
  const UserSchema = schema(hasKey("username"));
  
  await ctx.test("with key present", () => {
    const result = UserSchema.validate({ username: "alice" });
    assert.equal(result.valid, true);
  });
  
  await ctx.test("with key missing", () => {
    const result = UserSchema.validate({ name: "alice" });
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof MissingKeyError, true);
  });
  
  await ctx.test("with symbol key", () => {
    const sym = Symbol("k");
    const Sch = schema(hasKey(sym));
    assert.equal(Sch.validate({ [sym]: 1 }).valid, true);
    assert.equal(Sch.validate({}).valid, false);
  });
  
  await ctx.test("throws TypeError if key isn't a string or symbol", () => {
    assert.throws(() => hasKey(123), TypeError);
  });
});


await test("required()", async (ctx) => {
  await ctx.test("with valid values", () => {
    const vld = required();
    assert.equal(vld.validate("hello").valid, true);
    assert.equal(vld.validate(0).valid, true);
    assert.equal(vld.validate(false).valid, true);
    assert.equal(vld.validate(true).valid, true);
  });
  
  await ctx.test("with invalid values", () => {
    const vld = required();
    assert.equal(vld.validate(undefined).valid, false);
    assert.equal(vld.validate(null).valid, false);
    assert.equal(vld.validate("").valid, false);
    assert.equal(vld.validate([]).valid, false);
    assert.equal(vld.validate({}).valid, false);
    assert.equal(vld.validate(NaN).valid, false);
  });
  
  await ctx.test("with nested validators", async (inner) => {
    const Sch = schema(
      required(type(Object), key("foo", string.minLength(3))),
    );
    
    await inner.test("valid input passes", () => {
      assert.equal(Sch.validate({ foo: "bar" }).valid, true);
    });
    
    await inner.test("missing throws RequiredError, inner skipped", () => {
      const result = Sch.validate(null);
      assert.equal(result.valid, false);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors.at(0) instanceof RequiredError, true);
    });
    
    await inner.test("present but invalid runs inner validators", () => {
      const result = Sch.validate({ foo: "hi" });
      const firstError = result.errors.at(0);
      assert.equal(result.valid, false);
      assert.equal(firstError instanceof MinimumStringLengthError, true);
      assert.deepEqual(firstError.path, ["foo"]);
    });
  });
});


await test("optional()", async (ctx) => {
  const Sch = schema(optional(string.minLength(5)));
  
  await ctx.test("empty values pass", () => {
    assert.equal(Sch.validate(undefined).valid, true);
    assert.equal(Sch.validate(null).valid, true);
    assert.equal(Sch.validate("").valid, true);
  });
  
  await ctx.test("non-empty valid value passes", () => {
    assert.equal(Sch.validate("hello").valid, true);
  });
  
  await ctx.test("non-empty invalid value fails", () => {
    assert.equal(Sch.validate("hi").valid, false);
  });
});


await test("type()", async (ctx) => {
  await ctx.test("with valid input", () => {
    assert.equal(type(Object).validate({}).valid, true);
    assert.equal(type(Number).validate(42).valid, true);
    assert.equal(type(Array).validate([]).valid, true);
    assert.equal(type(String).validate("s").valid, true);
    assert.equal(type("string").validate("s").valid, true);
  });
  
  await ctx.test("with invalid input", () => {
    assert.equal(type(Object).validate("hi").valid, false);
    assert.equal(type(Number).validate({}).valid, false);
    const result = type(Object).validate("hi");
    assert.equal(
      result.errors.at(0) instanceof WrongTypeValidationError,
      true,
    );
  });
});


await test("type.oneOf()", async (ctx) => {
  class AKind {}
  class BKind {}
  class CKind {}
  
  const Sch = schema(type.oneOf(AKind, BKind, CKind));
  
  await ctx.test("with valid input", () => {
    assert.equal(Sch.validate(new AKind()).valid, true);
    assert.equal(Sch.validate(new BKind()).valid, true);
    assert.equal(Sch.validate(new CKind()).valid, true);
  });
  
  await ctx.test("with invalid input", () => {
    assert.equal(Sch.validate("hello").valid, false);
    assert.equal(Sch.validate(null).valid, false);
    assert.equal(Sch.validate(undefined).valid, false);
  });
});


await test("type.to()", async (ctx) => {
  await ctx.test("to Boolean", () => {
    assert.equal(type.to(Boolean).validate("foo").value, true);
    assert.equal(type.to(Boolean).validate("").value, false);
  });
  
  await ctx.test("to String", () => {
    assert.equal(type.to(String).validate(42).value, "42");
    assert.equal(type.to(String).validate(0).value, "0");
    assert.equal(type.to(String).validate([1, 2, 3]).value, "1,2,3");
  });
  
  await ctx.test("numeric string to Number", () => {
    const res = type.to(Number).validate("42");
    assert.equal(res.valid, true);
    assert.equal(res.value, 42);
  });
  
  await ctx.test("non-numeric string to Number is NaN but still valid", () => {
    const res = type.to(Number).validate("not-a-number");
    assert.equal(res.valid, true);
    assert.equal(Number.isNaN(res.value), true);
  });
  
  await ctx.test("to Object wraps null", () => {
    const res = type.to(Object).validate(null);
    assert.deepEqual(res.value, {});
  });
  
  await ctx.test("to Array", () => {
    const res = type.to(Array).validate("foo");
    assert.deepEqual(res.value, ["f", "o", "o"]);
  });
  
  await ctx.test("to Date", () => {
    const res = type.to(Date).validate("2021-01-01");
    assert.equal(res.value instanceof Date, true);
    assert.equal(Number.isNaN(res.value.getTime()), false);
  });
  
  await ctx.test("to BigInt", () => {
    const res = type.to(BigInt).validate("42");
    assert.equal(res.value, 42n);
  });
  
  await ctx.test("unsupported type throws TypeError", () => {
    assert.throws(() => type.to("banana"), TypeError);
  });
});


await test("oneOf()", async (ctx) => {
  const Sch = schema(oneOf("red", "green", "blue"));
  
  await ctx.test("with valid input", () => {
    assert.equal(Sch.validate("red").valid, true);
    assert.equal(Sch.validate("green").valid, true);
  });
  
  await ctx.test("with invalid input", () => {
    const result = Sch.validate("yellow");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof ValidationError, true);
  });
});


await test("minLength() (generic)", async (ctx) => {
  await ctx.test("with valid values", () => {
    const vld = minLength(5);
    assert.equal(vld.validate("hello").valid, true);
    assert.equal(vld.validate(["h", "e", "l", "l", "o"]).valid, true);
  });
  
  await ctx.test("with invalid values", () => {
    const vld = minLength(5);
    assert.equal(vld.validate("hi").valid, false);
    assert.equal(vld.validate(["h", "i"]).valid, false);
  });
  
  await ctx.test("with message override reading details", () => {
    const vld = minLength(3).message(
      (error) => `Must be at least ${error.details.minLength} chars`,
    );
    const result = vld.validate("a");
    assert.equal(result.errors.at(0).message, "Must be at least 3 chars");
  });
  
  await ctx.test("rejects values without numeric length", () => {
    const vld = minLength(3);
    assert.equal(vld.validate(42).valid, false);
  });
});


await test("string.minLength()", async () => {
  const Sch = schema(string.minLength(3));
  assert.equal(Sch.validate("hello").valid, true);
  const result = Sch.validate("hi");
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MinimumStringLengthError, true);
});


await test("string.maxLength()", async () => {
  const Sch = schema(string.maxLength(5));
  assert.equal(Sch.validate("hello").valid, true);
  const result = Sch.validate("hello world");
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MaximumStringLengthError, true);
});


await test("string.url()", async (ctx) => {
  const Sch = schema(string.url());
  
  await ctx.test("bare domain", () => {
    assert.equal(Sch.validate("example.com").valid, true);
  });
  
  await ctx.test("full URL", () => {
    assert.equal(Sch.validate("https://example.com/path").valid, true);
  });
  
  await ctx.test("URL with port", () => {
    assert.equal(Sch.validate("https://example.com:8080").valid, true);
  });
  
  await ctx.test("subdomain accepted", () => {
    assert.equal(Sch.validate("api.example.com").valid, true);
  });
  
  await ctx.test("IP address rejected", () => {
    assert.equal(Sch.validate("192.168.1.1").valid, false);
  });
  
  await ctx.test("localhost rejected (not listed public domain)", () => {
    assert.equal(Sch.validate("localhost").valid, false);
  });
  
  await ctx.test("empty string rejected", () => {
    const result = Sch.validate("");
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0) instanceof InvalidURLError, true);
  });
  
  await ctx.test("garbage rejected", () => {
    assert.equal(Sch.validate("not-a-url").valid, false);
  });
});


await test("string.email()", async (ctx) => {
  const Sch = schema(string.email());
  
  await ctx.test("with valid input", () => {
    assert.equal(Sch.validate("user@example.com").valid, true);
  });
  
  await ctx.test("with invalid inputs", () => {
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
    for (const vld of invalid) {
      assert.equal(Sch.validate(vld).valid, false, `expected invalid: ${vld}`);
    }
    const result = Sch.validate("bad");
    assert.equal(result.errors.at(0) instanceof InvalidEmailError, true);
  });
});


await test("string.isoDate()", async (ctx) => {
  const Sch = schema(string.isoDate());
  
  await ctx.test("valid dates", () => {
    assert.equal(Sch.validate("2024-01-01").valid, true);
    assert.equal(Sch.validate("2024-12-31").valid, true);
    assert.equal(Sch.validate("2024-02-29").valid, true); // leap year
    assert.equal(Sch.validate("2023-08-22").valid, true);
  });
  
  await ctx.test("invalid format", () => {
    assert.equal(Sch.validate("2024-1-1").valid, false);
    assert.equal(Sch.validate("24-01-01").valid, false);
    assert.equal(Sch.validate("2024/01/01").valid, false);
    assert.equal(Sch.validate("").valid, false);
    assert.equal(Sch.validate("08/22/2023").valid, false);
    assert.equal(Sch.validate("22-08-2023").valid, false);
    const result = Sch.validate("");
    assert.equal(result.errors.at(0) instanceof InvalidISODateError, true);
  });
  
  await ctx.test("invalid rollover dates rejected", () => {
    assert.equal(Sch.validate("2024-02-30").valid, false);
    assert.equal(Sch.validate("2024-13-01").valid, false);
    assert.equal(Sch.validate("2023-02-29").valid, false); // non-leap
    assert.equal(Sch.validate("2023-12-32").valid, false);
    assert.equal(Sch.validate("2024-04-31").valid, false);
    assert.equal(Sch.validate("2023-22-08").valid, false);
  });
  
  await ctx.test("non-string rejected", () => {
    assert.equal(Sch.validate(42).valid, false);
    assert.equal(Sch.validate(null).valid, false);
  });
});


await test("number.min()", async () => {
  const Sch = schema(number.min(10));
  assert.equal(Sch.validate(15).valid, true);
  const result = Sch.validate(5);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MinimumNumberError, true);
});


await test("number.max()", async () => {
  const Sch = schema(number.max(20));
  assert.equal(Sch.validate(15).valid, true);
  const result = Sch.validate(25);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof MaximumNumberError, true);
});


await test("number.finite()", async () => {
  const Sch = schema(number.finite());
  assert.equal(Sch.validate(42).valid, true);
  const result = Sch.validate(Infinity);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof FiniteNumberError, true);
});


await test("number.integer()", async () => {
  const Sch = schema(number.integer());
  assert.equal(Sch.validate(42).valid, true);
  const result = Sch.validate(42.5);
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(0) instanceof NonIntegerError, true);
});


await test("number.positive()", async () => {
  const Sch = schema(number.positive());
  assert.equal(Sch.validate(42).valid, true);
  assert.equal(Sch.validate(0).valid, false);
  assert.equal(Sch.validate(-5).valid, false);
  const result = Sch.validate(0);
  assert.equal(result.errors.at(0) instanceof PositiveNumberError, true);
});


await test("number.nonNegative()", async () => {
  const Sch = schema(number.nonNegative());
  assert.equal(Sch.validate(42).valid, true);
  assert.equal(Sch.validate(0).valid, true);
  assert.equal(Sch.validate(-5).valid, false);
  const result = Sch.validate(-1);
  assert.equal(result.errors.at(0) instanceof NonNegativeNumberError, true);
});


await test("isEmpty()", async (ctx) => {
  await ctx.test("primitives are never empty", () => {
    assert.equal(isEmpty(0), false);
    assert.equal(isEmpty(false), false);
    assert.equal(isEmpty("x"), false);
    assert.equal(isEmpty(42), false);
  });
  
  await ctx.test("strings/arrays use .length", () => {
    assert.equal(isEmpty(""), false); // string is primitive
    assert.equal(isEmpty([]), true);
    assert.equal(isEmpty([1]), false);
  });
  
  await ctx.test("Maps/Sets use .size", () => {
    assert.equal(isEmpty(new Map()), true);
    assert.equal(isEmpty(new Map([["a", 1]])), false);
    assert.equal(isEmpty(new Set()), true);
    assert.equal(isEmpty(new Set([1])), false);
  });
  
  await ctx.test("plain objects check enumerable properties", () => {
    assert.equal(isEmpty({}), true);
    assert.equal(isEmpty({ a: 1 }), false);
  });
});


await test("async composition", async (ctx) => {
  function asyncNotZero() {
    return new Validator(async (value) => {
      await Promise.resolve();
      if (value === 0) throw new ValidationError("Must not be zero");
    });
  }
  
  await ctx.test("schema() awaits async child validators", async () => {
    const Sch = schema(asyncNotZero());
    const result = await Sch.validateAsync(0);
    assert.equal(result.valid, false);
    assert.equal(result.errors.at(0).message, "Must not be zero");
  });
  
  await ctx.test("schema() sync validate throws on async child", () => {
    const Sch = schema(asyncNotZero());
    assert.throws(() => Sch.validate(0), TypeError);
  });
  
  await ctx.test("key() awaits async validators", async () => {
    const Sch = schema(key("n", asyncNotZero()));
    const ok = await Sch.validateAsync({ n: 1 });
    assert.equal(ok.valid, true);
    const bad = await Sch.validateAsync({ n: 0 });
    assert.equal(bad.valid, false);
    assert.deepEqual(bad.errors.at(0).path, ["n"]);
  });
  
  await ctx.test("items() awaits async validators", async () => {
    const Sch = schema(items(asyncNotZero()));
    const bad = await Sch.validateAsync([1, 0, 2]);
    assert.equal(bad.valid, false);
    assert.deepEqual(bad.errors.at(0).path, [1]);
  });
  
  await ctx.test("required() awaits async inner validators", async () => {
    const Sch = schema(required(asyncNotZero()));
    const bad = await Sch.validateAsync(0);
    assert.equal(bad.valid, false);
  });
  
  await ctx.test("optional() awaits async inner validators", async () => {
    const Sch = schema(optional(asyncNotZero()));
    const missing = await Sch.validateAsync(undefined);
    assert.equal(missing.valid, true);
    const bad = await Sch.validateAsync(0);
    assert.equal(bad.valid, false);
  });
});


await test("string.* type guards", async (ctx) => {
  await ctx.test("string.minLength rejects non-strings", () => {
    assert.equal(string.minLength(3).validate(42).valid, false);
    assert.equal(string.minLength(3).validate(null).valid, false);
    assert.equal(string.minLength(3).validate(undefined).valid, false);
  });
  
  await ctx.test("string.maxLength rejects non-strings", () => {
    assert.equal(string.maxLength(3).validate(42).valid, false);
    assert.equal(string.maxLength(3).validate(null).valid, false);
  });
});


await test("number.* type strictness", async (ctx) => {
  await ctx.test("rejects strings; use type.to(Number) to coerce", () => {
    assert.equal(number.min(1).validate("5").valid, false);
    assert.equal(number.max(10).validate("5").valid, false);
    assert.equal(number.positive().validate("5").valid, false);
    assert.equal(number.integer().validate("5").valid, false);
    
    const Coerced = schema(type.to(Number), number.min(1));
    const result = Coerced.validate("5");
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });
  
  await ctx.test("rejects NaN across every bound check", () => {
    assert.equal(number.min(1).validate(NaN).valid, false);
    assert.equal(number.max(1).validate(NaN).valid, false);
    assert.equal(number.positive().validate(NaN).valid, false);
    assert.equal(number.nonNegative().validate(NaN).valid, false);
  });
  
  await ctx.test("rejects null, undefined, booleans, objects", () => {
    const bad = [null, undefined, true, false, [], {}];
    for (const input of bad) {
      assert.equal(number.min(1).validate(input).valid, false);
    }
  });
});


await test("Validator as transform", async (ctx) => {
  await ctx.test("transforms value when fn returns non-undefined", () => {
    const vld = new Validator((num) => num * 2);
    const result = vld.validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 10);
  });
  
  await ctx.test("passes value through when fn returns undefined", () => {
    const vld = new Validator(() => undefined);
    const result = vld.validate(5);
    assert.equal(result.valid, true);
    assert.equal(result.value, 5);
  });
});
