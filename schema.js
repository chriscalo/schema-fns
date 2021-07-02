// TODO:
// - make sync: .validate(), .test(), .assert()
// - create async versions: .validateAsync(), .testAsync(), and .assertAsync()

const is = require("is");
const R = require("ramda");
const urlParseLax = require("url-parse-lax");
const { parseDomain } = require("parse-domain");


function schema(...fns) {
  // ensure all args are functions
  for (const [index, fn] of Object.entries(fns)) {
    if (!is.fn(fn)) {
      const msg = `schema(): value with index ${index} is not a function`;
      const error = new TypeError(msg);
      error.value = fn;
      throw error;
    }
  }
  function handler(value, update, error) {
    const { value: output, errors } = validate(value);
    for (const e of errors) {
      const { code, ...context } = e;
      error(code, context);
    }
    update(output);
  }
  
  handler.validate = validate;
  handler.test = test;
  handler.assert = assert;
  handler.validateAsync = validateAsync;
  handler.testAsync = testAsync;
  handler.assertAsync = assertAsync;
  
  function validate(input) {
    return validationPipeline(...fns)(input);
  }
  
  async function validateAsync(input) {
    return await validationPipelineAsync(...fns)(input);
  }
  
  function test(input) {
    const { valid } = validate(input);
    return valid;
  }
  
  async function testAsync(input) {
    const { valid } = await validateAsync(input);
    return valid;
  }
  
  function assert(input) {
    const { valid, value, errors } = validate(input);
    if (!valid) {
      throw createValidationError(errors);
    } else {
      return {
        valid,
        value,
      };
    }
  }
  
  async function assertAsync(input) {
    const { valid, value, errors } = await validateAsync(input);
    if (!valid) {
      throw createValidationError(errors);
    } else {
      return {
        valid,
        value,
      };
    }
  }
  
  function createValidationError(errors) {
    const message = [
      `Schema validation failed: ${errors.length} errors found`,
      ...errors.map(formatError),
    ].join("\n");
    const error = new ValidationError(message);
    error.details = [...errors];
    return error;
  }
  
  return handler;
}

class ValidationError extends Error {}

function formatError(error) {
  const { code, path, message, value } = error;
  return `[${code}] ${path.join(".")}: ${message}, received: ${value}`;
}

function key(name, ...fns) {
  const keySchema = schema(...fns);
  
  return function (value, update, error) {
    const input = value[name];
    keySchema(input, keyUpdate, keyError);
    
    function keyUpdate(newKeyValue) {
      const newValue = {
        ...value,
        [name]: newKeyValue,
      };
      update(newValue);
    }
    
    function keyError(code, context) {
      // runs depth first, so we need to prepend the key name
      error(code, {
        ...context,
        path: [name].concat(context.path || []),
      });
    }
  };
}

// validate an array of items
function items(...fns) {
  const itemSchema = schema(...fns);
  
  return function (value, update, error) {
    let items = value;
    let index = 0;
    
    while (index < items.length) {
      const item = items[index];
      itemSchema(item, itemUpdate, itemError);
      index++;
      
      function itemUpdate(newItemValue) {
        const newValue = [...items];
        newValue[index] = newItemValue;
        update(newValue);
        items = newValue;
      }
      
      function itemError(code, context) {
        // runs depth first, so we need to prepend the key name
        error(code, {
          ...context,
          path: [index].concat(context.path || []),
        });
      }
    }
  };
}

function hasKeys(...keys) {
  // TODO: assert keys are all strings
  return function (value, update, error) {
    const missingKeys = keys.filter(key => !(key in value));
    for (const key of missingKeys) {
      error("key.missing", {
        message: `expected key "${key}" missing`,
        key: key,
        value: value,
      });
    }
  };
}

function validationPipeline(...functions) {
  return function execValidationPipeline(input, update, error) {
    const errors = [];
    let value = input;
    
    for (const fn of functions) {
      fn(value, update, error);
    }
    
    const valid = !Boolean(errors.length);
    return { value, valid, errors };
    
    function update(newValue) {
      value = newValue;
    }
    
    function error(code, context) {
      const e = {
        code,
        path: [],
        ...context,
      };
      errors.push(e);
    }
  }
}

function validationPipelineAsync(...functions) {
  return async function execValidationPipelineAsync(input, update, error) {
    const errors = [];
    let value = input;
    
    for (const fn of functions) {
      await fn(value, update, error);
    }
    
    const valid = !Boolean(errors.length);
    return { value, valid, errors };
    
    function update(newValue) {
      value = newValue;
    }
    
    function error(code, context) {
      const e = {
        code,
        path: [],
        ...context,
      };
      errors.push(e);
    }
  }
}

function mapAdapter(mapFn) {
  return function (value, update) {
    const returnValue = mapFn(value);
    if (typeof returnValue !== "undefined") {
      update(returnValue);
    }
  };
}

function isType(type) {
  const types = new Map();
  types.set("undefined", { expected: "undefined", test: is.undefined});
  types.set(undefined,   { expected: "undefined", test: is.undefined});
  types.set("null",      { expected: "null",      test: is.null});
  types.set(null,        { expected: "null",      test: is.null});
  types.set(Object,      { expected: "object",    test: is.object});
  types.set("object",    { expected: "object",    test: is.object});
  types.set(Array,       { expected: "array",     test: is.array});
  types.set("array",     { expected: "array",     test: is.array});
  types.set(Boolean,     { expected: "boolean",   test: is.boolean});
  types.set("boolean",   { expected: "boolean",   test: is.boolean});
  types.set(Number,      { expected: "number",    test: is.number});
  types.set("number",    { expected: "number",    test: is.number});
  types.set(BigInt,      { expected: "bigint",    test: is.bigint});
  types.set("bigint",    { expected: "bigint",    test: is.bigint});
  types.set(String,      { expected: "string",    test: is.string});
  types.set("string",    { expected: "string",    test: is.string});
  types.set(Symbol,      { expected: "symbol",    test: is.symbol});
  types.set("symbol",    { expected: "symbol",    test: is.symbol});
  types.set(Function,    { expected: "function",  test: is.function});
  types.set("function",  { expected: "function",  test: is.function});
  
  return function (value, update, error) {
    const { expected, test } = types.get(type);
    if (!test(value)) {
      error("is.type", {
        message: `wrong type: expected ${expected}`,
        expectedType: expected,
        value,
      });
    }
  };
}

function as(type) {
  const types = new Map();
  types.set(Boolean,   function (value) { return Boolean(value); });
  types.set("boolean", function (value) { return Boolean(value); });
  types.set(Number,    function (value) { return Number(value); });
  types.set("number",  function (value) { return Number(value); });
  types.set(BigInt,    function (value) { return BigInt(value); });
  types.set("bigint",  function (value) { return BigInt(value); });
  types.set(String,    function (value) { return String(value); });
  types.set("string",  function (value) { return String(value); });
  
  return function (value, update) {
    const fn = types.get(type);
    const newValue = fn(value);
    update(newValue);
  };
}

function isOneOf(...values) {
  return function (value, update, error) {
    if (!values.includes(value)) {
      error("is.oneof", {
        message: `expected one of [${values.join(", ")}], got ${value}`,
        value: value,
      });
    }
  };
}

function isUrl() {
  return function (value, update, error) {
    if (value && value.length) {
      const parsedUrl = urlParseLax(value);
      const parsedDomain = parseDomain(parsedUrl.hostname);
      
      const domainValid =
        Boolean(parsedDomain.domain) &&
        Boolean(parsedDomain.topLevelDomains.length) &&
        parsedDomain.type === "LISTED";
      console.log(domainValid, parsedDomain);
      if (!domainValid) {
        error("type.url", {
          message: "There's something wrong with this URL.",
        });
      }
    }
  };
}

function length(min = 0, max = Infinity) {
  return function (value, update, error) {
    if (value.length < min) {
      const message = (min === 0) ?
        `value cannot be empty` :
        `value must be at least ${min} in length`;
      error("length.min", {
        message,
      });
    }
    
    if (value.length > max) {
      error("length.max", {
        message: `value cannot exceed ${max} in length`,
      });
    }
  };
}

function required() {
  return function (value, update, error) {
    if (!Boolean(value)) {
      error("required", {
        message: `value is required`,
        value,
      });
    }
  };
}

module.exports = {
 schema,
 key,
 hasKeys,
 items,
 mapAdapter,
 required,
 isType,
 is: isType,
 as,
 to: as,
 isOneOf,
 length,
 isUrl,
};
