/** Turning decimals and engine tokens into the strings the display shows. */

import { DISPLAY_DIGITS, Decimal } from './decimal.js';

const EXPONENTIAL_UPPER_BOUND = 16; // integer digits before switching to E notation
const EXPONENTIAL_LOWER_BOUND = -15; // exponent below which small values use E notation

export const OPERATOR_SYMBOLS = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  root: 'ʸ√',
  mod: 'mod',
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
  nand: 'NAND',
  nor: 'NOR',
  lsh: '<<',
  rsh: '>>',
  rol: 'RoL',
  ror: 'RoR',
};

export function groupDigits(integerDigits) {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function splitSign(text) {
  return text.startsWith('-') ? ['-', text.slice(1)] : ['', text];
}

function digitsOf(decimal) {
  const digits = decimal.n < 0n ? (-decimal.n).toString() : decimal.n.toString();
  return digits;
}

/** Scientific notation the way Windows Calculator prints it. */
export function toExponentialString(decimal, digits = DISPLAY_DIGITS) {
  const rounded = decimal.roundToSignificant(digits);
  if (rounded.isZero()) return '0e+0';
  const raw = digitsOf(rounded);
  const exponent = raw.length - 1 - rounded.scale;
  const fraction = raw.slice(1).replace(/0+$/, '');
  const mantissa = fraction ? `${raw[0]}.${fraction}` : raw[0];
  const sign = rounded.isNegative() ? '-' : '';
  const exponentSign = exponent < 0 ? '-' : '+';
  return `${sign}${mantissa}e${exponentSign}${Math.abs(exponent)}`;
}

export function toPlainString(decimal, { group = true, digits = DISPLAY_DIGITS } = {}) {
  const rounded = decimal.roundToSignificant(digits);
  const [sign, magnitude] = splitSign(rounded.toString());
  if (!group) return `${sign}${magnitude}`;
  const [integerPart, fractionPart] = magnitude.split('.');
  const grouped = groupDigits(integerPart);
  return fractionPart === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped}.${fractionPart}`;
}

/**
 * Format a value for the main display.
 *
 * @param {Decimal} decimal
 * @param {{ fe?: boolean, group?: boolean, digits?: number }} [options]
 */
export function formatValue(decimal, options = {}) {
  const { fe = false, group = true, digits = DISPLAY_DIGITS } = options;
  const value = Decimal.from(decimal);
  if (value.isZero()) return fe ? '0e+0' : '0';

  const rounded = value.roundToSignificant(digits);
  if (fe) return toExponentialString(rounded, digits);

  const integerDigits = rounded.integerDigitCount();
  const raw = digitsOf(rounded);
  const exponent = raw.length - 1 - rounded.scale;
  if (integerDigits > EXPONENTIAL_UPPER_BOUND || exponent < EXPONENTIAL_LOWER_BOUND) {
    return toExponentialString(rounded, digits);
  }
  return toPlainString(rounded, { group, digits });
}

/**
 * Format the digits the user is currently typing. Unlike formatValue this
 * keeps a trailing separator ("12." stays "12.") so typing feels natural.
 *
 * @param {string} entry
 * @param {{ group?: boolean }} [options]
 */
export function formatEntry(entry, options = {}) {
  const { group = true } = options;
  const text = String(entry);
  const [sign, magnitude] = splitSign(text);
  const [numberPart, exponentPart] = magnitude.split(/e/i);
  const [integerPart = '0', fractionPart] = numberPart.split('.');
  const groupedInteger = group ? groupDigits(integerPart) : integerPart;

  let formatted = groupedInteger;
  if (numberPart.includes('.')) formatted += `.${fractionPart ?? ''}`;
  if (exponentPart !== undefined) {
    const exponentSign = exponentPart.startsWith('-') ? '-' : '+';
    const exponentDigits = exponentPart.replace(/^[+-]/, '');
    formatted += `e${exponentSign}${exponentDigits}`;
  }
  return `${sign}${formatted}`;
}

/** Join expression tokens with the thin spacing Windows Calculator uses. */
export function formatExpression(tokens) {
  return tokens.filter((token) => token !== '' && token !== undefined).join(' ');
}
