const test = require("ava");

test("schema() returns a function", (t) => {
  const { schema } = require("./schema.js");
  t.is(typeof schema(), "function");
});

test("schema() has sync & async validate, test, and assert functions", (t) => {
  const { schema } = require("./schema.js");
  t.is(typeof schema().validate, "function");
  t.is(typeof schema().test, "function");
  t.is(typeof schema().assert, "function");
  t.is(typeof schema().validateAsync, "function");
  t.is(typeof schema().testAsync, "function");
  t.is(typeof schema().assertAsync, "function");
});

test("transform functions modify the value", (t) => {
  const { schema, mapAdapter } = require("./schema.js");
  const MySchema = schema(
    mapAdapter(value => String(value)),
    mapAdapter(value => value + "1"),
  );
  const { valid, value, errors } = MySchema.validate(42);
  t.is(valid, true);
  t.is(value, "421");
  // FIXME: should error be null if empty? 🤔
  t.deepEqual(errors, []);
});

// TODO: test mapAdapter()

// TODO: test that errors are of type ValidationError
// OR: a single ValidationError is created with an array of the problems found

test("schema().validate() collects and returns errors", (t) => {
  const { schema, is } = require("./schema.js");
  const MySchema = schema(
    is(Object),
  );
  const { valid, value, errors } = MySchema.validate(42);
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

test("hasKeys() returns errors when keys are missing", (t) => {
  const { schema, hasKeys } = require("./schema.js");
  const MySchema = schema(
    hasKeys("foo", "bar"),
  );
  const { valid, value, errors } = MySchema.validate({});
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

test("key() transforms value", (t) => {
  const { schema, key, mapAdapter } = require("./schema.js");
  const MySchema = schema(
    key(
      "name",
      mapAdapter(value => `Hello, ${value}!`),
      mapAdapter(value => String(value).toUpperCase()),
    ),
  );
  const { valid, value, errors } = MySchema.validate({
    name: "World",
  });
  t.is(valid, true);
  t.deepEqual(value, {
    "name": "HELLO, WORLD!",
  });
  t.deepEqual(errors, []);
});

test("key() collects errors", (t) => {
  const { schema, is, key } = require("./schema.js");
  const MySchema = schema(
    key("foo", is(Object)),
  );
  const { valid, value, errors } = MySchema.validate({
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

test("key() is recursive", (t) => {
  const { schema, is, key } = require("./schema.js");
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

test("items() transform values", (t) => {
  const { schema, items, mapAdapter } = require("./schema.js");
  t.plan(3);
  const MySchema = schema(
    items(
      mapAdapter(value => value * 2),
      mapAdapter(value => String(value) + String(value)),
      mapAdapter(Number),
    ),
  );
  const { valid, value, errors } = MySchema.validate([
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

test("items() collects errors", (t) => {
  const { schema, is, items } = require("./schema.js");
  const MySchema = schema(
    items(is(Number)),
  );
  const { valid, value, errors } = MySchema.validate([
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

test("schema().test() returns true if valid, false otherwise", (t) => {
  const { schema, is } = require("./schema.js");
  const MySchema = schema(
    is(Object),
  );
  t.is(MySchema.test(42), false);
  t.is(MySchema.test({}), true);
  t.is(MySchema.test("hi"), false);
});

test("schema().assert() throws if invalid, doesn't otherwise", (t) => {
  const { schema, is } = require("./schema.js");
  t.plan(3);
  const MySchema = schema(
    is(Object),
  );
  t.throws(() => {
    MySchema.assert(42);
  });
  t.throws(() => {
    MySchema.assert("hi");
  });
  t.notThrows(() => {
    MySchema.assert({});
  });
});

test("isUrl() validates humanized URLs", (t) => {
  const { schema, isUrl } = require("./schema.js");
  
  const MySchema = schema(
    isUrl(),
  );
  
  // humanized URLs
  t.is(true, MySchema.validate("google.com").valid);
  t.is(true, MySchema.validate("google.com/path").valid);
  t.is(true, MySchema.validate("www.google.com").valid);
  t.is(true, MySchema.validate("http://google.com").valid);
  t.is(true, MySchema.validate("https://google.com").valid);
  t.is(true, MySchema.validate("ftp://google.com").valid);
  
  // non-URLs
  t.is(false, MySchema.validate("foo").valid);
  t.is(false, MySchema.validate("http").valid);
  t.is(false, MySchema.validate("http:").valid);
  t.is(false, MySchema.validate("http://").valid);
  t.is(false, MySchema.validate("/bar").valid);
  t.is(false, MySchema.validate("foo/bar").valid);
  
  // falsy values should pass? => or should we use an optional() function? 🤔
  t.is(true, MySchema.validate("").valid);
  t.is(true, MySchema.validate(null).valid);
  t.is(true, MySchema.validate(undefined).valid);
});
