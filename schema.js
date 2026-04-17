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
  #messageFunction = null;

  constructor(validateFunction) {
    assert(
      typeof validateFunction === "function",
      new TypeError(
        "new Validator(validateFunction): validateFunction must be a function",
      ),
    );
    this.#validateFunction = validateFunction;
  }

  message(stringOrFunction) {
    switch (typeof stringOrFunction) {
      case "string": {
        const s = stringOrFunction;
        this.#messageFunction = () => s;
        return this;
      }
      case "function": {
        this.#messageFunction = stringOrFunction;
        return this;
      }
      default:
        throw new TypeError(
          "Validator.message(stringOrFunction): stringOrFunction must be a string or function",
        );
    }
  }

  validate(value) {
    try {
      const returnValue = this.#validateFunction(value);
      if (typeof returnValue !== "undefined") value = returnValue;
      return ValidationResult.ok(value);
    } catch (errors) {
      return this.#handleErrors(errors);
    }
  }

  async validateAsync(value) {
    try {
      const returnValue = await this.#validateFunction(value);
      if (typeof returnValue !== "undefined") value = returnValue;
      return ValidationResult.ok(value);
    } catch (errors) {
      return this.#handleErrors(errors);
    }
  }

  #handleErrors(errors) {
    errors = ensureArray(errors);
    const allValidationErrors = errors.every(
      (error) => error instanceof ValidationError,
    );

    if (allValidationErrors) {
      if (this.#messageFunction) {
        for (const error of errors) {
          error.message = this.#messageFunction(error);
        }
      }
      return ValidationResult.error(errors);
    } else {
      const nonValidationErrors = errors.filter(
        (error) => !(error instanceof ValidationError),
      );
      throw nonValidationErrors;
    }
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

  return new Validator((value) => {
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
  });
}

export function key(name, ...functionsOrValidators) {
  const KeySchema = schema(...functionsOrValidators);

  return new Validator((value) => {
    const input = value[name];
    const result = KeySchema.validate(input);

    if (result.valid) {
      return { ...value, [name]: result.value };
    }
    throw result.errors.map((error) => {
      error.path = [name].concat(error.path ?? []);
      return error;
    });
  });
}

export function items(...functionsOrValidators) {
  const ItemSchema = schema(...functionsOrValidators);

  return new Validator((value) => {
    if (!Array.isArray(value)) {
      throw new ValidationError({
        message: "value must be an array",
        details: { value, valueType: typeof value },
      });
    }

    const items = value;
    const errors = [];

    for (let index = 0; index < items.length; index++) {
      const result = ItemSchema.validate(items[index]);
      if (result.valid) {
        items[index] = result.value;
      } else {
        for (const error of result.errors) {
          error.path = [index].concat(error.path ?? []);
          errors.push(error);
        }
      }
    }

    if (errors.length > 0) throw errors;
    return items;
  });
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
  return new Validator((value) => {
    if (
      value === null ||
      value === undefined ||
      Number.isNaN(value) ||
      value?.valueOf?.() === "" ||
      value?.length === 0 ||
      value?.size === 0 ||
      isEmpty(value)
    ) {
      throw new RequiredError({
        message: "Value is required",
        details: { value },
      });
    }
    const result = Inner.validate(value);
    if (result.valid) return result.value;
    throw result.errors;
  });
}

export function optional(...functionsOrValidators) {
  const Inner = schema(...functionsOrValidators);
  const emptyValues = [undefined, null, ""];

  return new Validator((value) => {
    if (emptyValues.includes(value)) return;
    const result = Inner.validate(value);
    if (result.valid) return result.value;
    throw result.errors;
  });
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
    if (!allowedTypes.some((T) => value instanceof T)) {
      const typeNames = allowedTypes.map((T) => T.name ?? T);
      throw new ValidationError({
        message: `Value must be one of: ${serialComma(typeNames, "or")}`,
        details: { value, allowedTypes },
      });
    }
  });
};

type.to = function toType(Type) {
  const conversions = new Map();
  conversions.set(Array, (v) => Array.from(v));
  conversions.set(BigInt, (v) => BigInt(v));
  conversions.set(Boolean, (v) => Boolean(v));
  conversions.set(Date, (v) => new Date(v));
  conversions.set(Function, (v) => Function(v));
  conversions.set(Map, (v) => new Map(v));
  conversions.set(Number, (v) => Number(v));
  conversions.set(Object, (v) => Object(v));
  conversions.set(Promise, (v) => Promise.resolve(v));
  conversions.set(RegExp, (v) => new RegExp(v));
  conversions.set(Set, (v) => new Set(v));
  conversions.set(String, (v) => String(v));
  conversions.set(Symbol, (v) => Symbol.for(v));
  conversions.set(Uint8Array, (v) => new Uint8Array(v));

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
        details: { value, minLength: minLen },
      });
    }
    if (value.length < minLen) {
      throw new MinLengthError({
        message: `Length of value must be at least ${minLen}`,
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
    const roundTrip = Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);
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
    if (typeof value !== "number" || value <= 0) {
      throw new PositiveNumberError({
        message: "Value must be a positive number",
        details: { value },
      });
    }
  });
};

number.nonNegative = function numberNonNegative() {
  return new Validator((value) => {
    if (typeof value !== "number" || value < 0) {
      throw new NonNegativeNumberError({
        message: "Value must be a non-negative number",
        details: { value },
      });
    }
  });
};


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
    for (const _ of value) return NOT_EMPTY;
    return EMPTY;
  } catch (_) {
    // not iterable
  }

  try {
    for (const _ of Object.entries(value)) return NOT_EMPTY;
    return EMPTY;
  } catch (_) {
    // not enumerable
  }

  return NOT_EMPTY;
}


export const mapAdapter = (fn) => new Validator(fn);


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
