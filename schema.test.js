const test = require("ava");

test("schema() returns a function", (t) => {
  const { schema } = require("./schema.js");
  t.is(typeof schema(), "function");
});

test("schema().validate is a function", (t) => {
  const { schema } = require("./schema.js");
  t.is(typeof schema().validate, "function");
});

test("transform functions modify the value", async (t) => {
  const { schema, mapAdapter } = require("./schema.js");
  const mySchema = schema(
    mapAdapter(value => String(value)),
    mapAdapter(value => value + "1"),
  );
  const { valid, value, errors } = await mySchema.validate(42);
  t.is(valid, true);
  t.is(value, "421");
  // FIXME: should error be null if empty? 🤔
  t.deepEqual(errors, []);
});

// TODO: test mapAdapter()

// TODO: test that errors are of type ValidationError
// OR: a single ValidationError is created with an array of the problems found

test("schema().validate() collects and returns errors", async (t) => {
  const { schema, is } = require("./schema.js");
  const mySchema = schema(
    is(Object),
  );
  const { valid, value, errors } = await mySchema.validate(42);
  t.is(valid, false);
  t.is(value, 42);
  t.deepEqual(errors, [{
    code: "is.type",
    path: [],
    message: "wrong type: expected object",
    expectedType: "object",
    value: 42,
  }]);
});

test("hasKeys() returns errors when keys are missing", async (t) => {
  const { schema, hasKeys } = require("./schema.js");
  const mySchema = schema(
    hasKeys("foo", "bar"),
  );
  const { valid, value, errors } = await mySchema.validate({});
  t.is(valid, false);
  t.deepEqual(value, {});
  t.deepEqual(errors, [{
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
  }]);
});

test("key() transforms value", async (t) => {
  const { schema, key, mapAdapter } = require("./schema.js");
  const mySchema = schema(
    key(
      "name",
      mapAdapter(value => `Hello, ${value}!`),
      mapAdapter(value => String(value).toUpperCase()),
    ),
  );
  const { valid, value, errors } = await mySchema.validate({
    name: "World",
  });
  t.is(valid, true);
  t.deepEqual(value, {
    "name": "HELLO, WORLD!",
  });
  t.deepEqual(errors, []);
});

test("key() collects errors", async (t) => {
  const { schema, is, key } = require("./schema.js");
  const mySchema = schema(
    key("foo", is(Object)),
  );
  const { valid, value, errors } = await mySchema.validate({
    foo: 42,
  });
  t.is(valid, false);
  t.deepEqual(value, {
    foo: 42,
  });
  t.deepEqual(errors, [{
    code: "is.type",
    path: ["foo"],
    message: "wrong type: expected object",
    expectedType: "object",
    value: 42,
  }]);
});

test("key() is recursive", async (t) => {
  const { schema, is, key } = require("./schema.js");
  const mySchema = schema(
    key(
      "name",
      is(Object),
      key("first", is(String)),
    ),
  );
  const { valid, value, errors } = await mySchema.validate({
    name: {
      first: 42,
    },
  });
  t.is(valid, false);
  t.deepEqual(value, {
    name: {
      first: 42,
    },
  });
  t.deepEqual(errors, [{
    code: "is.type",
    path: ["name", "first"],
    message: "wrong type: expected string",
    expectedType: "string",
    value: 42,
  }]);
});

test("items() transform values", async (t) => {
  const { schema, items, mapAdapter } = require("./schema.js");
  t.plan(3);
  const mySchema = schema(
    items(
      mapAdapter(value => value * 2),
      mapAdapter(value => String(value) + String(value)),
      mapAdapter(Number),
    ),
  );
  const { valid, value, errors } = await mySchema.validate([
    1,
    2,
    3,
  ]);
  
  t.is(valid, true);
  t.deepEqual(value, [
    22,
    44,
    66,
  ]);
  t.deepEqual(errors, []);
});

test("items() collects errors", async (t) => {
  const { schema, is, items } = require("./schema.js");
  const mySchema = schema(
    items(is(Number)),
  );
  const { valid, value, errors } = await mySchema.validate([
    1,
    2,
    "3",
    4,
    "5",
  ]);
  t.is(valid, false);
  t.deepEqual(value, [1, 2, "3", 4, "5"]);
  t.deepEqual(errors, [{
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
  }]);
});

test("schema().test() returns true if valid, false otherwise", async (t) => {
  const { schema, is } = require("./schema.js");
  const mySchema = schema(
    is(Object),
  );
  t.is(await mySchema.test(42), false);
  t.is(await mySchema.test({}), true);
  t.is(await mySchema.test("hi"), false);
});

test("schema().assert() throws if invalid, doesn't otherwise", async (t) => {
  const { schema, is } = require("./schema.js");
  t.plan(3);
  const mySchema = schema(
    is(Object),
  );
  await t.throwsAsync(async () => {
    await mySchema.assert(42);
  });
  await t.throwsAsync(async () => {
    await mySchema.assert("hi");
  });
  await t.notThrowsAsync(async () => {
    await mySchema.assert({});
  });
});
