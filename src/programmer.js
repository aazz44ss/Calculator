/**
 * Integer maths for programmer mode.
 *
 * Values are plain BigInts interpreted as 64 bit two's complement numbers,
 * which is what makes `NOT 0` show as `-1` in DEC and as
 * `FFFF FFFF FFFF FFFF` in HEX at the same time.
 */

import { groupDigits } from './format.js';

export class ProgrammerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProgrammerError';
  }
}

/** Everything is a signed 64 bit integer, like QWORD on Windows. */
export const WIDTH_BITS = 64n;
export const MASK = (1n << WIDTH_BITS) - 1n;

export const NUMBER_BASES = [
  { id: 'hex', label: 'HEX', radix: 16n, digits: '0123456789ABCDEF', group: 4 },
  { id: 'dec', label: 'DEC', radix: 10n, digits: '0123456789', group: 3 },
  { id: 'oct', label: 'OCT', radix: 8n, digits: '01234567', group: 3 },
  { id: 'bin', label: 'BIN', radix: 2n, digits: '01', group: 4 },
];

export const DEFAULT_BASE = 'dec';

export function baseFor(baseId) {
  return NUMBER_BASES.find((candidate) => candidate.id === baseId) ?? NUMBER_BASES[1];
}

/** Reinterpret `value` as a signed 64 bit two's complement number. */
export function wrapSigned(value) {
  const unsigned = ((value % (MASK + 1n)) + MASK + 1n) & MASK;
  return unsigned >= 1n << (WIDTH_BITS - 1n) ? unsigned - (MASK + 1n) : unsigned;
}

/** The bit pattern of `value`, always non-negative. */
export function toUnsigned(value) {
  return wrapSigned(value) & MASK;
}

export function isDigitInBase(digit, baseId) {
  return baseFor(baseId).digits.includes(String(digit).toUpperCase());
}

/** Parse a string of base digits into an unsigned BigInt. */
export function parseDigits(text, baseId) {
  const { radix, digits } = baseFor(baseId);
  let value = 0n;
  for (const character of String(text).toUpperCase()) {
    if (character === ' ' || character === ',') continue;
    const digit = digits.indexOf(character);
    if (digit < 0) throw new ProgrammerError('Invalid input');
    value = value * radix + BigInt(digit);
  }
  return value;
}

function groupFromRight(text, size) {
  const groups = [];
  for (let end = text.length; end > 0; end -= size) {
    groups.unshift(text.slice(Math.max(0, end - size), end));
  }
  return groups.join(' ');
}

/**
 * Render a value in one of the four bases. DEC keeps the sign, the other
 * bases show the raw bit pattern, exactly like Windows Calculator.
 */
export function formatInteger(value, baseId) {
  const base = baseFor(baseId);
  if (base.id === 'dec') {
    const signed = wrapSigned(value);
    const text = groupDigits((signed < 0n ? -signed : signed).toString(10));
    return signed < 0n ? `-${text}` : text;
  }
  const digits = toUnsigned(value).toString(Number(base.radix)).toUpperCase();
  return groupFromRight(digits, base.group);
}

/** How many digits of `baseId` still fit into 64 bits. */
export function maxDigitsFor(baseId) {
  const base = baseFor(baseId);
  if (base.id === 'dec') return MASK.toString(10).length;
  const perDigit = { hex: 4n, oct: 3n, bin: 1n }[base.id];
  return Number((WIDTH_BITS + perDigit - 1n) / perDigit);
}

function shiftAmount(value) {
  const amount = wrapSigned(value);
  if (amount < 0n) throw new ProgrammerError('Invalid input');
  return amount > WIDTH_BITS ? WIDTH_BITS : amount;
}

/**
 * @param {bigint} left
 * @param {string} operator
 * @param {bigint} right
 * @returns {bigint}
 */
export function computeInteger(left, operator, right) {
  const leftBits = toUnsigned(left);
  const rightBits = toUnsigned(right);

  switch (operator) {
    case 'add':
      return wrapSigned(left + right);
    case 'subtract':
      return wrapSigned(left - right);
    case 'multiply':
      return wrapSigned(left * right);
    case 'divide':
      if (right === 0n) throw new ProgrammerError('Cannot divide by zero');
      return wrapSigned(left / right); // BigInt division truncates
    case 'mod':
      if (right === 0n) throw new ProgrammerError('Cannot divide by zero');
      return wrapSigned(left % right);
    case 'and':
      return wrapSigned(leftBits & rightBits);
    case 'or':
      return wrapSigned(leftBits | rightBits);
    case 'xor':
      return wrapSigned(leftBits ^ rightBits);
    case 'nand':
      return wrapSigned(~(leftBits & rightBits) & MASK);
    case 'nor':
      return wrapSigned(~(leftBits | rightBits) & MASK);
    case 'lsh':
      return wrapSigned(left << shiftAmount(right));
    case 'rsh':
      return wrapSigned(left >> shiftAmount(right)); // arithmetic
    case 'rol': {
      const places = shiftAmount(right) % WIDTH_BITS;
      if (places === 0n) return wrapSigned(left);
      return wrapSigned(((leftBits << places) | (leftBits >> (WIDTH_BITS - places))) & MASK);
    }
    case 'ror': {
      const places = shiftAmount(right) % WIDTH_BITS;
      if (places === 0n) return wrapSigned(left);
      return wrapSigned(((leftBits >> places) | (leftBits << (WIDTH_BITS - places))) & MASK);
    }
    default:
      throw new ProgrammerError('Invalid input');
  }
}

export function notInteger(value) {
  return wrapSigned(~toUnsigned(value));
}
