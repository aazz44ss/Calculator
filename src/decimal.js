/**
 * Fixed-point decimal arithmetic on top of BigInt.
 *
 * A value is stored as `n / 10^scale`, so addition, subtraction and
 * multiplication are exact. That is the whole reason this module exists:
 * `0.1 + 0.2` has to render as `0.3` and `0.07 × 100` has to be exactly `7`,
 * which binary doubles cannot promise.
 *
 * Division and square roots are computed to DIVISION_SCALE decimals and
 * rounded half-away-from-zero. Transcendental functions (trigonometry,
 * logarithms, arbitrary powers) fall back to double precision and then snap
 * the result, because 40 digits of series expansion is not worth the code.
 */

export const DIVISION_SCALE = 40;
export const DISPLAY_DIGITS = 16;

const SNAP_RELATIVE_TOLERANCE = 1e-12;
const DOUBLE_DIGITS = 15;
const MAX_EXACT_POWER_SCALE = 400;

export class DecimalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecimalError';
  }
}

const POW10_CACHE = new Map();

function pow10(exponent) {
  if (exponent < 0) throw new DecimalError('Negative power of ten');
  const cached = POW10_CACHE.get(exponent);
  if (cached !== undefined) return cached;
  const value = 10n ** BigInt(exponent);
  if (exponent <= 128) POW10_CACHE.set(exponent, value);
  return value;
}

function absBigInt(value) {
  return value < 0n ? -value : value;
}

/** Divide two BigInts, rounding halves away from zero. */
function divideRounded(numerator, denominator) {
  if (denominator === 0n) throw new DecimalError('Cannot divide by zero');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = absBigInt(numerator);
  const absDenominator = absBigInt(denominator);
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Integer square root (Newton's method) of a non-negative BigInt. */
function bigIntSqrt(value) {
  if (value < 0n) throw new DecimalError('Invalid input');
  if (value < 2n) return value;
  let guess = 1n << (BigInt(value.toString(2).length + 1) / 2n);
  for (;;) {
    const next = (guess + value / guess) >> 1n;
    if (next >= guess) break;
    guess = next;
  }
  return guess;
}

const DECIMAL_PATTERN = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

export class Decimal {
  /** @param {bigint} n @param {number} scale */
  constructor(n, scale = 0) {
    if (typeof n !== 'bigint') throw new DecimalError('Decimal requires a BigInt');
    if (!Number.isInteger(scale) || scale < 0) throw new DecimalError('Invalid scale');
    let digits = n;
    let exponent = scale;
    if (digits === 0n) {
      exponent = 0;
    } else {
      while (exponent > 0 && digits % 10n === 0n) {
        digits /= 10n;
        exponent -= 1;
      }
    }
    this.n = digits;
    this.scale = exponent;
    Object.freeze(this);
  }

  static fromString(text) {
    const trimmed = String(text).trim().replace(/[\s,_]/g, '');
    const match = DECIMAL_PATTERN.exec(trimmed);
    if (!match) throw new DecimalError(`Invalid number "${text}"`);
    const [, sign, integerPart = '', fractionPart = '', exponentPart] = match;
    if (!integerPart && !fractionPart) throw new DecimalError(`Invalid number "${text}"`);

    let digits = BigInt(`${integerPart || '0'}${fractionPart}`);
    let scale = fractionPart.length;
    if (exponentPart) {
      const exponent = Number(exponentPart);
      if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100000) {
        throw new DecimalError('Exponent out of range');
      }
      scale -= exponent;
      if (scale < 0) {
        digits *= pow10(-scale);
        scale = 0;
      }
    }
    if (sign === '-') digits = -digits;
    return new Decimal(digits, scale);
  }

  static fromNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DecimalError('Invalid input');
    }
    if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
      return new Decimal(BigInt(value), 0);
    }
    return Decimal.fromString(value.toPrecision(DOUBLE_DIGITS));
  }

  static from(value) {
    if (value instanceof Decimal) return value;
    if (typeof value === 'bigint') return new Decimal(value, 0);
    if (typeof value === 'number') return Decimal.fromNumber(value);
    return Decimal.fromString(value);
  }

  /**
   * Convert a double into a Decimal, snapping away floating point noise.
   * Used by every function that has to go through binary math.
   */
  static fromDoubleSnapped(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DecimalError('Invalid input');
    }
    if (value === 0) return Decimal.ZERO;
    const nearestInteger = Math.round(value);
    const tolerance = SNAP_RELATIVE_TOLERANCE * Math.max(1, Math.abs(nearestInteger));
    if (Math.abs(value - nearestInteger) <= tolerance) {
      return Decimal.fromNumber(nearestInteger);
    }
    return Decimal.fromString(value.toPrecision(DOUBLE_DIGITS));
  }

  get sign() {
    if (this.n > 0n) return 1;
    if (this.n < 0n) return -1;
    return 0;
  }

  isZero() {
    return this.n === 0n;
  }

  isNegative() {
    return this.n < 0n;
  }

  isInteger() {
    return this.scale === 0;
  }

  /** Digits of this value expressed at `scale` decimals (exact widening only). */
  digitsAt(scale) {
    if (scale < this.scale) throw new DecimalError('Cannot narrow scale without rounding');
    return this.n * pow10(scale - this.scale);
  }

  negate() {
    return new Decimal(-this.n, this.scale);
  }

  abs() {
    return this.n < 0n ? this.negate() : this;
  }

  add(other) {
    const value = Decimal.from(other);
    const scale = Math.max(this.scale, value.scale);
    return new Decimal(this.digitsAt(scale) + value.digitsAt(scale), scale);
  }

  subtract(other) {
    return this.add(Decimal.from(other).negate());
  }

  multiply(other) {
    const value = Decimal.from(other);
    return new Decimal(this.n * value.n, this.scale + value.scale);
  }

  divide(other, scale = DIVISION_SCALE) {
    const value = Decimal.from(other);
    if (value.isZero()) throw new DecimalError('Cannot divide by zero');
    const numerator = this.n * pow10(value.scale + scale);
    const denominator = value.n * pow10(this.scale);
    return new Decimal(divideRounded(numerator, denominator), scale);
  }

  /** Truncated remainder, matching the `mod` key on Windows Calculator. */
  remainder(other) {
    const value = Decimal.from(other);
    if (value.isZero()) throw new DecimalError('Cannot divide by zero');
    const scale = Math.max(this.scale, value.scale);
    return new Decimal(this.digitsAt(scale) % value.digitsAt(scale), scale);
  }

  compare(other) {
    const value = Decimal.from(other);
    const scale = Math.max(this.scale, value.scale);
    const left = this.digitsAt(scale);
    const right = value.digitsAt(scale);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  equals(other) {
    return this.compare(other) === 0;
  }

  /** Round to `scale` decimals, halves away from zero. */
  roundTo(scale) {
    if (scale >= this.scale) return this;
    const divisor = pow10(this.scale - scale);
    return new Decimal(divideRounded(this.n, divisor), scale);
  }

  truncateTo(scale) {
    if (scale >= this.scale) return this;
    const divisor = pow10(this.scale - scale);
    return new Decimal(this.n / divisor, scale);
  }

  /** Number of digits before the decimal point of |value| (0 for |value| < 1). */
  integerDigitCount() {
    const digits = absBigInt(this.n).toString().length;
    return Math.max(0, digits - this.scale);
  }

  /** Round to `digits` significant digits, halves away from zero. */
  roundToSignificant(digits = DISPLAY_DIGITS) {
    if (this.isZero()) return this;
    const totalDigits = absBigInt(this.n).toString().length;
    if (totalDigits <= digits) return this;
    const drop = totalDigits - digits;
    if (drop > this.scale) {
      // Rounding reaches into the integer part; keep the magnitude.
      const divisor = pow10(drop);
      const rounded = divideRounded(this.n, divisor);
      return new Decimal(rounded * pow10(drop - this.scale), 0);
    }
    return this.roundTo(this.scale - drop);
  }

  /** Exact integer power; falls back to doubles for fractional exponents. */
  power(other) {
    const exponent = Decimal.from(other);
    if (exponent.isZero()) return Decimal.ONE;
    if (this.isZero()) {
      if (exponent.isNegative()) throw new DecimalError('Cannot divide by zero');
      return Decimal.ZERO;
    }
    if (exponent.isInteger()) {
      const magnitude = Number(absBigInt(exponent.n));
      if (magnitude <= 1000 && this.scale * magnitude <= MAX_EXACT_POWER_SCALE) {
        let result = Decimal.ONE;
        let base = this;
        let remaining = BigInt(magnitude);
        while (remaining > 0n) {
          if (remaining & 1n) result = result.multiply(base);
          remaining >>= 1n;
          if (remaining > 0n) base = base.multiply(base);
        }
        return exponent.isNegative() ? Decimal.ONE.divide(result) : result;
      }
    }
    if (this.isNegative() && !exponent.isInteger()) throw new DecimalError('Invalid input');
    return Decimal.fromDoubleSnapped(this.toNumber() ** exponent.toNumber());
  }

  sqrt() {
    if (this.isNegative()) throw new DecimalError('Invalid input');
    if (this.isZero()) return Decimal.ZERO;
    const workingScale = DIVISION_SCALE + 1;
    const shift = 2 * workingScale - this.scale;
    const digits = shift >= 0 ? this.n * pow10(shift) : this.n / pow10(-shift);
    const root = bigIntSqrt(digits);
    return new Decimal(root, workingScale).roundTo(DIVISION_SCALE);
  }

  toNumber() {
    return Number(this.toString());
  }

  /** Plain decimal notation, never exponential. */
  toString() {
    const negative = this.n < 0n;
    const digits = absBigInt(this.n).toString();
    let text;
    if (this.scale === 0) {
      text = digits;
    } else {
      const padded = digits.padStart(this.scale + 1, '0');
      const cut = padded.length - this.scale;
      const fraction = padded.slice(cut).replace(/0+$/, '');
      text = fraction ? `${padded.slice(0, cut)}.${fraction}` : padded.slice(0, cut);
    }
    return negative && text !== '0' ? `-${text}` : text;
  }

  toJSON() {
    return this.toString();
  }
}

Decimal.ZERO = new Decimal(0n, 0);
Decimal.ONE = new Decimal(1n, 0);
Decimal.TWO = new Decimal(2n, 0);
Decimal.TEN = new Decimal(10n, 0);
Decimal.HUNDRED = new Decimal(100n, 0);

export const ZERO = Decimal.ZERO;
export const ONE = Decimal.ONE;

/* ------------------------------------------------------------------ *
 * Angle handling
 * ------------------------------------------------------------------ */

export const ANGLE_UNITS = ['deg', 'rad', 'grad'];

const QUARTER_TURN = { deg: 90n, grad: 100n };
const HALF_TURN_RADIANS = Math.PI;

/**
 * Exact quarter-turn index for degree/gradian angles.
 * Returns 0..3 when the angle is an exact multiple of a quarter turn,
 * otherwise null. This is what makes sin(180°) exactly 0.
 */
export function quarterTurnIndex(angle, unit) {
  const quarter = QUARTER_TURN[unit];
  if (!quarter) return null;
  const denominator = pow10(angle.scale) * quarter;
  if (angle.n % denominator !== 0n) return null;
  const turns = angle.n / denominator;
  return Number(((turns % 4n) + 4n) % 4n);
}

function toRadians(angle, unit) {
  const value = angle.toNumber();
  if (unit === 'deg') return (value * HALF_TURN_RADIANS) / 180;
  if (unit === 'grad') return (value * HALF_TURN_RADIANS) / 200;
  return value;
}

function fromRadians(value, unit) {
  if (unit === 'deg') return (value * 180) / HALF_TURN_RADIANS;
  if (unit === 'grad') return (value * 200) / HALF_TURN_RADIANS;
  return value;
}

const QUARTER_SIN = [0, 1, 0, -1];
const QUARTER_COS = [1, 0, -1, 0];

export function sin(angle, unit = 'rad') {
  const quarter = quarterTurnIndex(angle, unit);
  if (quarter !== null) return Decimal.fromNumber(QUARTER_SIN[quarter]);
  return Decimal.fromDoubleSnapped(Math.sin(toRadians(angle, unit)));
}

export function cos(angle, unit = 'rad') {
  const quarter = quarterTurnIndex(angle, unit);
  if (quarter !== null) return Decimal.fromNumber(QUARTER_COS[quarter]);
  return Decimal.fromDoubleSnapped(Math.cos(toRadians(angle, unit)));
}

export function tan(angle, unit = 'rad') {
  const quarter = quarterTurnIndex(angle, unit);
  if (quarter !== null) {
    if (quarter % 2 === 1) throw new DecimalError('Invalid input');
    return Decimal.ZERO;
  }
  return Decimal.fromDoubleSnapped(Math.tan(toRadians(angle, unit)));
}

export function asin(value, unit = 'rad') {
  if (value.abs().compare(ONE) > 0) throw new DecimalError('Invalid input');
  return Decimal.fromDoubleSnapped(fromRadians(Math.asin(value.toNumber()), unit));
}

export function acos(value, unit = 'rad') {
  if (value.abs().compare(ONE) > 0) throw new DecimalError('Invalid input');
  return Decimal.fromDoubleSnapped(fromRadians(Math.acos(value.toNumber()), unit));
}

export function atan(value, unit = 'rad') {
  return Decimal.fromDoubleSnapped(fromRadians(Math.atan(value.toNumber()), unit));
}

export function sinh(value) {
  return Decimal.fromDoubleSnapped(Math.sinh(value.toNumber()));
}

export function cosh(value) {
  return Decimal.fromDoubleSnapped(Math.cosh(value.toNumber()));
}

export function tanh(value) {
  return Decimal.fromDoubleSnapped(Math.tanh(value.toNumber()));
}

export function asinh(value) {
  return Decimal.fromDoubleSnapped(Math.asinh(value.toNumber()));
}

export function acosh(value) {
  if (value.compare(ONE) < 0) throw new DecimalError('Invalid input');
  return Decimal.fromDoubleSnapped(Math.acosh(value.toNumber()));
}

export function atanh(value) {
  if (value.abs().compare(ONE) >= 0) throw new DecimalError('Invalid input');
  return Decimal.fromDoubleSnapped(Math.atanh(value.toNumber()));
}

export function ln(value) {
  if (value.isNegative() || value.isZero()) throw new DecimalError('Invalid input');
  return Decimal.fromDoubleSnapped(Math.log(value.toNumber()));
}

export function log10(value) {
  if (value.isNegative() || value.isZero()) throw new DecimalError('Invalid input');
  // Exact for powers of ten, which is the common case on a calculator.
  const digits = absBigInt(value.n).toString();
  if (/^10*$/.test(digits)) return new Decimal(BigInt(digits.length - 1 - value.scale), 0);
  return Decimal.fromDoubleSnapped(Math.log10(value.toNumber()));
}

export function exp(value) {
  return Decimal.fromDoubleSnapped(Math.exp(value.toNumber()));
}

export function factorial(value) {
  if (!value.isInteger() || value.isNegative()) throw new DecimalError('Invalid input');
  const limit = value.n;
  if (limit > 3000n) throw new DecimalError('Overflow');
  let result = 1n;
  for (let index = 2n; index <= limit; index += 1n) result *= index;
  return new Decimal(result, 0);
}

export const PI = Decimal.fromString(
  '3.1415926535897932384626433832795028841972',
);
export const E = Decimal.fromString(
  '2.7182818284590452353602874713526624977572',
);
