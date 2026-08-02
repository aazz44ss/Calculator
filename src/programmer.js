/**
 * Integer maths for programmer mode.
 *
 * Values are plain BigInts interpreted as two's complement numbers of the
 * selected bit width, which is what makes `NOT 0` show as `-1` in DEC and as
 * `FFFF FFFF FFFF FFFF` in HEX at the same time.
 */

import { groupDigits } from './format.js';

export class ProgrammerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProgrammerError';
  }
}

export const BIT_WIDTHS = [
  { id: 'byte', label: 'BYTE', bits: 8n },
  { id: 'word', label: 'WORD', bits: 16n },
  { id: 'dword', label: 'DWORD', bits: 32n },
  { id: 'qword', label: 'QWORD', bits: 64n },
];

export const NUMBER_BASES = [
  { id: 'hex', label: 'HEX', radix: 16n, digits: '0123456789ABCDEF', group: 4 },
  { id: 'dec', label: 'DEC', radix: 10n, digits: '0123456789', group: 3 },
  { id: 'oct', label: 'OCT', radix: 8n, digits: '01234567', group: 3 },
  { id: 'bin', label: 'BIN', radix: 2n, digits: '01', group: 4 },
];

export const DEFAULT_BASE = 'dec';
export const DEFAULT_BIT_WIDTH = 'qword';

export function bitsForWidth(widthId) {
  const width = BIT_WIDTHS.find((candidate) => candidate.id === widthId);
  return (width ?? BIT_WIDTHS[BIT_WIDTHS.length - 1]).bits;
}

export function baseFor(baseId) {
  return NUMBER_BASES.find((candidate) => candidate.id === baseId) ?? NUMBER_BASES[1];
}

export function maskFor(bits) {
  return (1n << bits) - 1n;
}

/** Reinterpret `value` as a signed two's complement number of `bits` bits. */
export function wrapSigned(value, bits) {
  const mask = maskFor(bits);
  const unsigned = ((value % (mask + 1n)) + mask + 1n) & mask;
  return unsigned >= 1n << (bits - 1n) ? unsigned - (mask + 1n) : unsigned;
}

/** The bit pattern of `value` at `bits` width, always non-negative. */
export function toUnsigned(value, bits) {
  return wrapSigned(value, bits) & maskFor(bits);
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
export function formatInteger(value, baseId, bits) {
  const base = baseFor(baseId);
  if (base.id === 'dec') {
    const signed = wrapSigned(value, bits);
    const text = groupDigits((signed < 0n ? -signed : signed).toString(10));
    return signed < 0n ? `-${text}` : text;
  }
  const digits = toUnsigned(value, bits).toString(Number(base.radix)).toUpperCase();
  return groupFromRight(digits, base.group);
}

/** How many digits of `baseId` still fit inside `bits` bits. */
export function maxDigitsFor(baseId, bits) {
  const base = baseFor(baseId);
  if (base.id === 'dec') return maskFor(bits).toString(10).length;
  const perDigit = { hex: 4n, oct: 3n, bin: 1n }[base.id];
  return Number((bits + perDigit - 1n) / perDigit);
}

function shiftAmount(value, bits) {
  const amount = wrapSigned(value, bits);
  if (amount < 0n) throw new ProgrammerError('Invalid input');
  return amount > bits ? bits : amount;
}

/**
 * @param {bigint} left
 * @param {string} operator
 * @param {bigint} right
 * @param {bigint} bits
 * @returns {bigint}
 */
export function computeInteger(left, operator, right, bits) {
  const mask = maskFor(bits);
  const leftBits = toUnsigned(left, bits);
  const rightBits = toUnsigned(right, bits);

  switch (operator) {
    case 'add':
      return wrapSigned(left + right, bits);
    case 'subtract':
      return wrapSigned(left - right, bits);
    case 'multiply':
      return wrapSigned(left * right, bits);
    case 'divide':
      if (right === 0n) throw new ProgrammerError('Cannot divide by zero');
      return wrapSigned(left / right, bits); // BigInt division truncates
    case 'mod':
      if (right === 0n) throw new ProgrammerError('Cannot divide by zero');
      return wrapSigned(left % right, bits);
    case 'and':
      return wrapSigned(leftBits & rightBits, bits);
    case 'or':
      return wrapSigned(leftBits | rightBits, bits);
    case 'xor':
      return wrapSigned(leftBits ^ rightBits, bits);
    case 'nand':
      return wrapSigned(~(leftBits & rightBits) & mask, bits);
    case 'nor':
      return wrapSigned(~(leftBits | rightBits) & mask, bits);
    case 'lsh':
      return wrapSigned(left << shiftAmount(right, bits), bits);
    case 'rsh':
      return wrapSigned(left >> shiftAmount(right, bits), bits); // arithmetic
    case 'rol': {
      const places = shiftAmount(right, bits) % bits;
      if (places === 0n) return wrapSigned(left, bits);
      return wrapSigned(((leftBits << places) | (leftBits >> (bits - places))) & mask, bits);
    }
    case 'ror': {
      const places = shiftAmount(right, bits) % bits;
      if (places === 0n) return wrapSigned(left, bits);
      return wrapSigned(((leftBits >> places) | (leftBits << (bits - places))) & mask, bits);
    }
    default:
      throw new ProgrammerError('Invalid input');
  }
}

export function notInteger(value, bits) {
  return wrapSigned(~toUnsigned(value, bits), bits);
}
