const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  schema,
  mapAdapter,
  key,
  hasKeys,
  items,
  is,
  isUrl,
  required,
  isType,
  as,
  to,
  isOneOf,
  length,
} = require("./schema.js");

test("module exports", () => {
  assert.strictEqual(typeof schema, "function");
  assert.strictEqual(typeof mapAdapter, "function");
  assert.strictEqual(typeof key, "function");
  assert.strictEqual(typeof hasKeys, "function");
  assert.strictEqual(typeof items, "function");
  assert.strictEqual(typeof is, "function");
  assert.strictEqual(typeof isUrl, "function");
  assert.strictEqual(typeof required, "function");
  assert.strictEqual(typeof isType, "function");
  assert.strictEqual(typeof as, "function");
  assert.strictEqual(typeof to, "function");
  assert.strictEqual(typeof isOneOf, "function");
  assert.strictEqual(typeof length, "function");
});

test("schema() returns a function", () => {
  assert.strictEqual(typeof schema(), "function");
});

test("schema() has sync & async validate, test, and assert functions", () => {
  const s = schema();
  assert.strictEqual(typeof s.validate, "function");
  assert.strictEqual(typeof s.test, "function");
  assert.strictEqual(typeof s.assert, "function");
  assert.strictEqual(typeof s.validateAsync, "function");
  assert.strictEqual(typeof s.testAsync, "function");
  assert.strictEqual(typeof s.assertAsync, "function");
});

test("transform functions modify the value", () => {
  const MySchema = schema(
    mapAdapter(value => String(value)),
    mapAdapter(value => value + "1"),
  );
  const actual = MySchema.validate(42);
  const expected = {
    valid: true,
    value: "421",
    errors: [],
  };
  assert.deepStrictEqual(actual, expected);
});

test("schema().validate() collects and returns errors", () => {
  const MySchema = schema(
    is(Object),
  );
  const actual = MySchema.validate(42);
  const expected = {
    valid: false,
    value: 42,
    errors: [{
      code: "is.type",
      path: [],
      message: "wrong type: expected object",
      expectedType: "object",
      value: 42,
    }],
  };
  assert.deepStrictEqual(actual, expected);
});

test("hasKeys() returns errors when keys are missing", () => {
  const MySchema = schema(
    hasKeys("foo", "bar"),
  );
  const actual = MySchema.validate({});
  const expected = {
    valid: false,
    value: {},
    errors: [{
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
    }],
  };
  assert.deepStrictEqual(actual, expected);
});

test("key() transforms value", () => {
  const MySchema = schema(
    key(
      "name",
      mapAdapter(value => `Hello, ${value}!`),
      mapAdapter(value => String(value).toUpperCase()),
    ),
  );
  const actual = MySchema.validate({ name: "World" });
  const expected = {
    valid: true,
    value: { name: "HELLO, WORLD!" },
    errors: [],
  };
  assert.deepStrictEqual(actual, expected);
});

test("key() collects errors", () => {
  const MySchema = schema(
    key("foo", is(Object)),
  );
  const actual = MySchema.validate({ foo: 42 });
  const expected = {
    valid: false,
    value: { foo: 42 },
    errors: [{
      code: "is.type",
      path: ["foo"],
      message: "wrong type: expected object",
      expectedType: "object",
      value: 42,
    }],
  };
  assert.deepStrictEqual(actual, expected);
});

test("key() is recursive", () => {
  const MySchema = schema(
    key(
      "name",
      is(Object),
      key("first", is(String)),
    ),
  );
  const actual = MySchema.validate({ name: { first: 42 } });
  const expected = {
    valid: false,
    value: { name: { first: 42 } },
    errors: [{
      code: "is.type",
      path: ["name", "first"],
      message: "wrong type: expected string",
      expectedType: "string",
      value: 42,
    }],
  };
  assert.deepStrictEqual(actual, expected);
});

test("items() transform values", () => {
  const MySchema = schema(
    items(
      mapAdapter(value => value * 2),
      mapAdapter(value => String(value) + String(value)),
      mapAdapter(Number),
    ),
  );
  const actual = MySchema.validate([1, 2, 3]);
  const expected = {
    valid: true,
    value: [22, 44, 66],
    errors: [],
  };
  assert.deepStrictEqual(actual, expected);
});

test("items() collects errors", () => {
  const MySchema = schema(
    items(is(Number)),
  );
  const actual = MySchema.validate([1, 2, "3", 4, "5"]);
  const expected = {
    valid: false,
    value: [1, 2, "3", 4, "5"],
    errors: [{
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
    }],
  };
  assert.deepStrictEqual(actual, expected);
});

test("schema().test() returns true if valid, false otherwise", () => {
  const MySchema = schema(
    is(Object),
  );
  assert.strictEqual(MySchema.test(42), false);
  assert.strictEqual(MySchema.test({}), true);
  assert.strictEqual(MySchema.test("hi"), false);
});

test("schema().assert() throws if invalid, doesn't otherwise", () => {
  const MySchema = schema(
    is(Object),
  );
  assert.throws(() => MySchema.assert(42));
  assert.throws(() => MySchema.assert("hi"));
  MySchema.assert({});
});

test("isUrl() validates humanized URLs", () => {
  const MySchema = schema(
    isUrl(),
  );

  assert.ok(MySchema.validate("google.com").valid);
  assert.ok(MySchema.validate("google.com/path").valid);
  assert.ok(MySchema.validate("www.google.com").valid);
  assert.ok(MySchema.validate("http://google.com").valid);
  assert.ok(MySchema.validate("https://google.com").valid);
  assert.ok(MySchema.validate("ftp://google.com").valid);

  assert.ok(!MySchema.validate("foo").valid);
  assert.ok(!MySchema.validate("http").valid);
  assert.ok(!MySchema.validate("http:").valid);
  assert.ok(!MySchema.validate("http://").valid);
  assert.ok(!MySchema.validate("/bar").valid);
  assert.ok(!MySchema.validate("foo/bar").valid);

  assert.ok(MySchema.validate("").valid);
  assert.ok(MySchema.validate(null).valid);
  assert.ok(MySchema.validate(undefined).valid);
});
