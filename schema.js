import assert from "node:assert";
import { parseDomain } from "parse-domain";


export class ValidationError extends Error {
  path = [];
  
  constructor(messageOrOptions, extrasArg = undefined) {
    if (typeof messageOrOptions === "string") {
      const message = messageOrOptions;
      super(message);
      if (extrasArg) Object.assign(this, extrasArg);
    } else {
      const { message, ...extras } = messageOrOptions;
      super(message);
      Object.assign(this, extras);
    }
  }
}

export class RequiredError extends ValidationError {}

export class MinLengthError extends ValidationError {
  constructor({ message, minLength, ...extras }) {
    super({
      message: message ?? `Value must be at least ${minLength} in length`,
      minLength,
      ...extras,
    });
  }
}

export class MinimumStringLengthError extends ValidationError {}
export class MaximumStringLengthError extends ValidationError {}
export class MissingKeyError extends ValidationError {}
export class WrongTypeValidationError extends ValidationError {}
export class InvalidURLError extends ValidationError {}
export class InvalidEmailError extends ValidationError {}
export class InvalidISODateError extends ValidationError {}
export class MinimumNumberError extends ValidationError {}
export class MaximumNumberError extends ValidationError {}
export class FiniteNumberError extends ValidationError {}
export class NonIntegerError extends ValidationError {}
export class PositiveNumberError extends ValidationError {}
export class NonNegativeNumberError extends ValidationError {}


export class ValidationResult {
  static ok(value) {
    return new ValidationResult({ valid: true, value });
  }
  
  static error(errors) {
    return new ValidationResult({ valid: false, errors });
  }
  
  constructor({ valid, value, errors }) {
    assert(
      typeof valid === "boolean",
      new TypeError("ValidationResult: options.valid must be a boolean"),
    );
    
    if (valid) {
      this.valid = true;
      this.value = value;
    } else {
      this.valid = false;
      this.errors = errors;
    }
  }
}


export class Validator {
  #validateFunction = () => {};
  #validateAsyncFunction = null;
  #messageFunction = null;
  
  constructor(validateFunction, validateAsyncFunction = null) {
    assert(
      typeof validateFunction === "function",
      new TypeError(
        "new Validator(validateFunction): validateFunction must be a function",
      ),
    );
    if (validateAsyncFunction !== null) {
      assert(
        typeof validateAsyncFunction === "function",
        new TypeError(
          "new Validator(_, validateAsyncFunction): " +
            "validateAsyncFunction must be a function",
        ),
      );
    }
    this.#validateFunction = validateFunction;
    this.#validateAsyncFunction = validateAsyncFunction;
  }
  
  message(stringOrFunction) {
    switch (typeof stringOrFunction) {
      case "string": {
        const text = stringOrFunction;
        this.#messageFunction = () => text;
        return this;
      }
      case "function": {
        this.#messageFunction = stringOrFunction;
        return this;
      }
      default:
        throw new TypeError(
          "Validator.message(stringOrFunction): " +
            "stringOrFunction must be a string or function",
        );
    }
  }
  
  validate(value) {
    try {
      const returnValue = this.#validateFunction(value);
      if (isThenable(returnValue)) {
        returnValue.catch(() => {});
        throw new TypeError(
          "Validator.validate() received a thenable return value. " +
            "Use validateAsync() for async validators.",
        );
      }
      if (typeof returnValue !== "undefined") value = returnValue;
      return ValidationResult.ok(value);
    } catch (errors) {
      return this.#handleErrors(errors);
    }
  }
  
  async validateAsync(value) {
    const fn = this.#validateAsyncFunction ?? this.#validateFunction;
    try {
      const returnValue = await fn(value);
      if (typeof returnValue !== "undefined") value = returnValue;
      return ValidationResult.ok(value);
    } catch (errors) {
      return this.#handleErrors(errors);
    }
  }
  
  #handleErrors(errors) {
    const errorList = ensureArray(errors);
    const allValidationErrors = errorList.every(
      (error) => error instanceof ValidationError,
    );
    
    if (allValidationErrors) {
      if (this.#messageFunction) {
        for (const error of errorList) {
          error.message = this.#messageFunction(error);
        }
      }
      return ValidationResult.error(errorList);
    }
    
    if (errorList.length === 1) throw errorList[0];
    throw new AggregateError(errorList, "Validator received mixed errors");
  }
  
  test(value) {
    return this.validate(value).valid;
  }
  
  async testAsync(value) {
    return (await this.validateAsync(value)).valid;
  }
  
  assert(value) {
    const result = this.validate(value);
    if (!result.valid) {
      throw new ValidationError({
        message: "Validation failed",
        errors: result.errors,
      });
    }
    return result;
  }
  
  async assertAsync(value) {
    const result = await this.validateAsync(value);
    if (!result.valid) {
      throw new ValidationError({
        message: "Validation failed",
        errors: result.errors,
      });
    }
    return result;
  }
}


export function schema(...functionsOrValidators) {
  const validators = functionsOrValidators.map((fn, index) => {
    if (fn instanceof Validator) return fn;
    if (typeof fn === "function") return new Validator(fn);
    throw Object.assign(
      new TypeError(
        `schema(): argument at index ${index} is not a function or Validator`,
      ),
      { index, argument: fn },
    );
  });
  
  function sync(value) {
    const errors = [];
    for (const validator of validators) {
      const result = validator.validate(value);
      if (result.valid) {
        value = result.value;
      } else {
        errors.push(...result.errors);
      }
    }
    if (errors.length > 0) throw errors;
    return value;
  }
  
  async function async(value) {
    const errors = [];
    for (const validator of validators) {
      const result = await validator.validateAsync(value);
      if (result.valid) {
        value = result.value;
      } else {
        errors.push(...result.errors);
      }
    }
    if (errors.length > 0) throw errors;
    return value;
  }
  
  return new Validator(sync, async);
}

export function key(name, ...functionsOrValidators) {
  const KeySchema = schema(...functionsOrValidators);
  
  function sync(value) {
    requireObjectLike(value, name);
    const result = KeySchema.validate(value[name]);
    return handleKeyResult(value, name, result);
  }
  
  async function async(value) {
    requireObjectLike(value, name);
    const result = await KeySchema.validateAsync(value[name]);
    return handleKeyResult(value, name, result);
  }
  
  return new Validator(sync, async);
}

export function items(...functionsOrValidators) {
  const ItemSchema = schema(...functionsOrValidators);
  
  function sync(value) {
    assertArray(value);
    const errors = [];
    for (const [indexKey, item] of Object.entries(value)) {
      const index = Number(indexKey);
      const result = ItemSchema.validate(item);
      if (result.valid) {
        value[index] = result.value;
      } else {
        pushWithPath(errors, result.errors, index);
      }
    }
    if (errors.length > 0) throw errors;
    return value;
  }
  
  async function async(value) {
    assertArray(value);
    const errors = [];
    for (const [indexKey, item] of Object.entries(value)) {
      const index = Number(indexKey);
      const result = await ItemSchema.validateAsync(item);
      if (result.valid) {
        value[index] = result.value;
      } else {
        pushWithPath(errors, result.errors, index);
      }
    }
    if (errors.length > 0) throw errors;
    return value;
  }
  
  return new Validator(sync, async);
}

function handleKeyResult(value, name, result) {
  if (result.valid) return { ...value, [name]: result.value };
  throw result.errors.map((error) => {
    error.path = [name].concat(error.path ?? []);
    return error;
  });
}

function requireObjectLike(value, name) {
  if (value === null || value === undefined || typeof value !== "object") {
    const got = typeOf(value);
    throw new WrongTypeValidationError({
      message: `key("${String(name)}") expected an object, got ${got}`,
      details: { value, valueType: got, keyName: name },
    });
  }
}

function assertArray(value) {
  if (!Array.isArray(value)) {
    throw new ValidationError({
      message: "value must be an array",
      details: { value, valueType: typeof value },
    });
  }
}

function pushWithPath(errors, itemErrors, index) {
  for (const error of itemErrors) {
    error.path = [index].concat(error.path ?? []);
    errors.push(error);
  }
}

function typeOf(value) {
  if (value === null) return "null";
  return typeof value;
}

export function hasKey(key) {
  const isStringOrSymbol =
    typeof key === "string" || typeof key === "symbol";
    
  if (!isStringOrSymbol) {
    throw Object.assign(
      new TypeError(
        `hasKey(): key must be a string or symbol. Got: ${typeof key}`,
      ),
      { value: key },
    );
  }
  
  return new Validator((value) => {
    const defined =
      value !== null &&
      value !== undefined &&
      value[key] !== undefined;
      
    if (!defined) {
      throw new MissingKeyError({
        message: `Expected key "${String(key)}" is missing`,
        key,
        value,
      });
    }
  });
}


export function required(...functionsOrValidators) {
  const Inner = schema(...functionsOrValidators);
  
  function sync(value) {
    if (isMissing(value)) throw missingError(value);
    const result = Inner.validate(value);
    if (result.valid) return result.value;
    throw result.errors;
  }
  
  async function async(value) {
    if (isMissing(value)) throw missingError(value);
    const result = await Inner.validateAsync(value);
    if (result.valid) return result.value;
    throw result.errors;
  }
  
  return new Validator(sync, async);
}

export function optional(...functionsOrValidators) {
  const Inner = schema(...functionsOrValidators);
  
  function sync(value) {
    if (isOptionalEmpty(value)) return;
    const result = Inner.validate(value);
    if (result.valid) return result.value;
    throw result.errors;
  }
  
  async function async(value) {
    if (isOptionalEmpty(value)) return;
    const result = await Inner.validateAsync(value);
    if (result.valid) return result.value;
    throw result.errors;
  }
  
  return new Validator(sync, async);
}

function isMissing(value) {
  return (
    value === null ||
    value === undefined ||
    Number.isNaN(value) ||
    value?.valueOf?.() === "" ||
    value?.length === 0 ||
    value?.size === 0 ||
    isEmpty(value)
  );
}

function missingError(value) {
  return new RequiredError({
    message: "Value is required",
    details: { value },
  });
}

function isOptionalEmpty(value) {
  return value === undefined || value === null || value === "";
}


export function type(Type) {
  return new Validator((value) => {
    if (
      value === Type ||
      (typeof Type === "function" && value instanceof Type) ||
      typeof value === Type ||
      typeof value === Type?.name?.toLowerCase()
    ) {
      return;
    }
    const typeName = Type?.name ?? Type;
    throw new WrongTypeValidationError({
      message: `wrong type: expected ${typeName}, got ${typeof value}`,
      details: { expectedType: Type, value },
    });
  });
}

type.oneOf = function typeOneOf(...allowedTypes) {
  return new Validator((value) => {
    const matches = allowedTypes.some(
      (allowed) => value instanceof allowed,
    );
    if (!matches) {
      const typeNames = allowedTypes.map(
        (allowed) => allowed.name ?? allowed,
      );
      throw new ValidationError({
        message: `Value must be one of: ${serialComma(typeNames, "or")}`,
        details: { value, allowedTypes },
      });
    }
  });
};

type.to = function toType(Type) {
  const conversions = new Map();
  conversions.set(Array, (input) => Array.from(input));
  conversions.set(BigInt, (input) => BigInt(input));
  conversions.set(Boolean, (input) => Boolean(input));
  conversions.set(Date, (input) => new Date(input));
  conversions.set(Function, (input) => Function(input));
  conversions.set(Map, (input) => new Map(input));
  conversions.set(Number, (input) => Number(input));
  conversions.set(Object, (input) => Object(input));
  conversions.set(Promise, (input) => Promise.resolve(input));
  conversions.set(RegExp, (input) => new RegExp(input));
  conversions.set(Set, (input) => new Set(input));
  conversions.set(String, (input) => String(input));
  conversions.set(Symbol, (input) => Symbol.for(input));
  conversions.set(Uint8Array, (input) => new Uint8Array(input));
  
  const convert = conversions.get(Type) ?? Type;
  
  if (typeof convert !== "function") {
    const typeName = Type?.name ?? Type;
    throw new TypeError(`type.to(): unsupported type: ${typeName}`);
  }
  
  return new Validator((value) => convert(value));
};

export function oneOf(...values) {
  return new Validator((value) => {
    if (!values.includes(value)) {
      throw new ValidationError({
        message: `expected one of [${values.join(", ")}], got ${value}`,
        details: { value, expectedValues: values },
      });
    }
    return value;
  });
}


export function minLength(minLen) {
  return new Validator((value) => {
    if (typeof value?.length !== "number") {
      throw new MinLengthError({
        message: "Value must have a numeric length property",
        minLength: minLen,
        details: { value, minLength: minLen },
      });
    }
    if (value.length < minLen) {
      throw new MinLengthError({
        message: `Length of value must be at least ${minLen}`,
        minLength: minLen,
        details: { value, minLength: minLen },
      });
    }
  });
}


export function string() {
  return type(String);
}

string.minLength = function stringMinLength(minLen) {
  return new Validator((value) => {
    if (typeof value !== "string") {
      throw new MinimumStringLengthError({
        message: `Value must be a string to check minLength`,
        details: { value, valueType: typeof value, minLength: minLen },
      });
    }
    if (value.length < minLen) {
      throw new MinimumStringLengthError({
        message: `String must be at least ${minLen} characters long`,
        details: { value, minLength: minLen },
      });
    }
  });
};

string.maxLength = function stringMaxLength(maxLen) {
  return new Validator((value) => {
    if (typeof value !== "string") {
      throw new MaximumStringLengthError({
        message: `Value must be a string to check maxLength`,
        details: { value, valueType: typeof value, maxLength: maxLen },
      });
    }
    if (value.length > maxLen) {
      throw new MaximumStringLengthError({
        message: `String must be no longer than ${maxLen} characters`,
        details: { value, maxLength: maxLen },
      });
    }
  });
};

string.url = function stringURL() {
  return new Validator((value) => {
    try {
      const parsedUrl = new URL(prependHttp(value));
      const parsedDomain = parseDomain(parsedUrl.hostname);
      
      const domainValid =
        Boolean(parsedDomain.domain) &&
        Boolean(parsedDomain.topLevelDomains?.length) &&
        parsedDomain.type === "LISTED";
        
      if (!domainValid) {
        throw new InvalidURLError({
          message: "This doesn't look like a URL",
          details: { value, parsedUrl, parsedDomain },
        });
      }
    } catch (error) {
      if (error instanceof InvalidURLError) throw error;
      throw new InvalidURLError({
        message: "This doesn't look like a URL",
        details: { value, error },
      });
    }
  });
};

string.email = function stringEmail() {
  return new Validator((value) => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof value !== "string" || !pattern.test(value)) {
      throw new InvalidEmailError({
        message: "Value must be a valid email address",
        details: { value },
      });
    }
  });
};

string.isoDate = function stringIsoDate() {
  return new Validator((value) => {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof value !== "string" || !pattern.test(value)) {
      throw new InvalidISODateError({
        message: "Value must be in ISO date format (YYYY-MM-DD)",
        details: { value },
      });
    }
    const date = new Date(value);
    const roundTrip = Number.isNaN(date.getTime()) ?
      null :
      date.toISOString().slice(0, 10);
    if (roundTrip !== value) {
      throw new InvalidISODateError({
        message: "ISO date is invalid",
        details: { value },
      });
    }
  });
};


export function number() {
  return type(Number);
}

number.min = function numberMin(min) {
  return new Validator((value) => {
    if (!isRealNumber(value)) {
      throw new MinimumNumberError({
        message: "Value must be a number",
        details: { value, valueType: typeof value, min },
      });
    }
    if (value < min) {
      throw new MinimumNumberError({
        message: `Value must be at least ${min}`,
        details: { value, min },
      });
    }
  });
};

number.max = function numberMax(max) {
  return new Validator((value) => {
    if (!isRealNumber(value)) {
      throw new MaximumNumberError({
        message: "Value must be a number",
        details: { value, valueType: typeof value, max },
      });
    }
    if (value > max) {
      throw new MaximumNumberError({
        message: `Value must be no larger than ${max}`,
        details: { value, max },
      });
    }
  });
};

number.finite = function numberFinite() {
  return new Validator((value) => {
    if (!Number.isFinite(value)) {
      throw new FiniteNumberError({
        message: "Value must be a finite number",
        details: { value },
      });
    }
  });
};

number.integer = function numberInteger() {
  return new Validator((value) => {
    if (!Number.isInteger(value)) {
      throw new NonIntegerError({
        message: "Value must be an integer",
        details: { value },
      });
    }
  });
};

number.positive = function numberPositive() {
  return new Validator((value) => {
    if (!isRealNumber(value) || value <= 0) {
      throw new PositiveNumberError({
        message: "Value must be a positive number",
        details: { value },
      });
    }
  });
};

number.nonNegative = function numberNonNegative() {
  return new Validator((value) => {
    if (!isRealNumber(value) || value < 0) {
      throw new NonNegativeNumberError({
        message: "Value must be a non-negative number",
        details: { value },
      });
    }
  });
};

function isRealNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}


export function isEmpty(value) {
  const EMPTY = true;
  const NOT_EMPTY = false;
  
  if (isPrimitive(value)) return NOT_EMPTY;
  if (typeof value.length === "number") {
    return value.length === 0 ? EMPTY : NOT_EMPTY;
  }
  if (typeof value.size === "number") {
    return value.size === 0 ? EMPTY : NOT_EMPTY;
  }
  
  try {
    for (const item of value) {
      void item;
      return NOT_EMPTY;
    }
    return EMPTY;
  } catch {
    // not iterable
  }
  
  try {
    for (const entry of Object.entries(value)) {
      void entry;
      return NOT_EMPTY;
    }
    return EMPTY;
  } catch {
    // not enumerable
  }
  
  return NOT_EMPTY;
}


function isThenable(value) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [value];
}

function isPrimitive(value) {
  return (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  );
}

function prependHttp(value) {
  if (typeof value !== "string") return value;
  if (/^https?:\/\//i.test(value)) return value;
  return "http://" + value;
}

function serialComma(items, conjunction = "and") {
  if (items.length === 0) return "";
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}
