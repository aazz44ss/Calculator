import assert from 'node:assert/strict';
import test from 'node:test';

import { CalculatorEngine } from '../src/engine.js';
import {
  ProgrammerError,
  computeInteger,
  formatInteger,
  isDigitInBase,
  maxDigitsFor,
  notInteger,
  parseDigits,
  toUnsigned,
  wrapSigned,
} from '../src/programmer.js';

const MAX_SIGNED = 2n ** 63n - 1n;
const MIN_SIGNED = -(2n ** 63n);
const ALL_ONES = 2n ** 64n - 1n;

const digit = (value) => ({ type: 'digit', value });
const operator = (value) => ({ type: 'operator', value });
const EQUALS = { type: 'equals' };

function press(engine, ...actions) {
  for (const action of actions) engine.press(action);
  return engine;
}

function digits(text) {
  return [...text].map((character) => digit(character));
}

function run(actions, options = {}) {
  return press(new CalculatorEngine({ mode: 'programmer', ...options }), ...actions);
}

const basesOf = (engine) =>
  Object.fromEntries(engine.getState().bases.map((base) => [base.id, base.text]));

/* ------------------------------------------------------------------ *
 * Bit width arithmetic
 * ------------------------------------------------------------------ */

test('values wrap into 64 bit two\'s complement', () => {
  assert.equal(wrapSigned(200n), 200n);
  assert.equal(wrapSigned(MAX_SIGNED), MAX_SIGNED);
  assert.equal(wrapSigned(MAX_SIGNED + 1n), MIN_SIGNED);
  assert.equal(wrapSigned(ALL_ONES), -1n);
  assert.equal(wrapSigned(2n ** 64n), 0n);
  assert.equal(wrapSigned(-1n), -1n);
});

test('the unsigned view keeps the raw bit pattern', () => {
  assert.equal(toUnsigned(-1n), ALL_ONES);
  assert.equal(toUnsigned(-2n), ALL_ONES - 1n);
  assert.equal(toUnsigned(5n), 5n);
  assert.equal(toUnsigned(MIN_SIGNED), 2n ** 63n);
});

test('digits are validated against the active base', () => {
  assert.ok(isDigitInBase('F', 'hex'));
  assert.ok(!isDigitInBase('F', 'dec'));
  assert.ok(!isDigitInBase('9', 'oct'));
  assert.ok(isDigitInBase('7', 'oct'));
  assert.ok(isDigitInBase('1', 'bin'));
  assert.ok(!isDigitInBase('2', 'bin'));
});

test('digit strings parse per base and reject stray characters', () => {
  assert.equal(parseDigits('FF', 'hex'), 255n);
  assert.equal(parseDigits('deadBEEF', 'hex'), 3735928559n);
  assert.equal(parseDigits('377', 'oct'), 255n);
  assert.equal(parseDigits('1011', 'bin'), 11n);
  assert.equal(parseDigits('1 234', 'dec'), 1234n);
  assert.throws(() => parseDigits('2', 'bin'), ProgrammerError);
});

test('each base is grouped the way Windows groups it', () => {
  assert.equal(formatInteger(255n, 'hex'), 'FF');
  assert.equal(formatInteger(4294967295n, 'hex'), 'FFFF FFFF');
  assert.equal(formatInteger(255n, 'bin'), '1111 1111');
  assert.equal(formatInteger(255n, 'oct'), '377');
  assert.equal(formatInteger(1234567n, 'dec'), '1,234,567');
  assert.equal(formatInteger(-1n, 'dec'), '-1');
  assert.equal(formatInteger(-1n, 'hex'), 'FFFF FFFF FFFF FFFF');
  assert.equal(formatInteger(-2n, 'bin').endsWith('1110'), true);
});

test('input length is capped at 64 bits', () => {
  assert.equal(maxDigitsFor('hex'), 16);
  assert.equal(maxDigitsFor('bin'), 64);
  assert.equal(maxDigitsFor('oct'), 22);
  assert.equal(maxDigitsFor('dec'), 20);
});

test('integer arithmetic truncates and wraps', () => {
  assert.equal(computeInteger(7n, 'divide', 2n), 3n);
  assert.equal(computeInteger(-7n, 'divide', 2n), -3n);
  assert.equal(computeInteger(7n, 'mod', 2n), 1n);
  assert.equal(computeInteger(200n, 'add', 100n), 300n);
  assert.equal(computeInteger(MAX_SIGNED, 'add', 1n), MIN_SIGNED);
  assert.throws(() => computeInteger(1n, 'divide', 0n), /Cannot divide by zero/);
});

test('bitwise operators work on the raw bits', () => {
  assert.equal(computeInteger(0xffn, 'and', 0x0fn), 0x0fn);
  assert.equal(computeInteger(0xf0n, 'or', 0x0fn), 0xffn);
  assert.equal(computeInteger(0xffn, 'xor', 0x0fn), 0xf0n);
  assert.equal(toUnsigned(computeInteger(0xffn, 'nand', 0x0fn)) & 0xffn, 0xf0n);
  assert.equal(toUnsigned(computeInteger(0xf0n, 'nor', 0x0fn)) & 0xffn, 0x00n);
  assert.equal(notInteger(0n), -1n);
  assert.equal(toUnsigned(notInteger(0n)), ALL_ONES);
});

test('shifts and rotations stay inside 64 bits', () => {
  assert.equal(computeInteger(1n, 'lsh', 4n), 16n);
  assert.equal(computeInteger(1n, 'lsh', 63n), MIN_SIGNED); // the sign bit
  assert.equal(computeInteger(16n, 'rsh', 4n), 1n);
  assert.equal(computeInteger(-16n, 'rsh', 2n), -4n); // arithmetic shift
  assert.equal(computeInteger(1n, 'rol', 1n), 2n);
  assert.equal(computeInteger(1n, 'ror', 1n), MIN_SIGNED); // wraps to the top bit
  assert.equal(computeInteger(5n, 'rol', 0n), 5n);
  assert.throws(() => computeInteger(1n, 'lsh', -1n), ProgrammerError);
});

/* ------------------------------------------------------------------ *
 * The state machine in programmer mode
 * ------------------------------------------------------------------ */

test('the four bases always show the current value', () => {
  const engine = run(digits('255'));
  assert.equal(engine.displayText(), '255');
  assert.deepEqual(basesOf(engine), {
    hex: 'FF',
    dec: '255',
    oct: '377',
    bin: '1111 1111',
  });
});

test('switching base keeps the value and re-reads the keypad', () => {
  const engine = run(digits('255'));
  engine.press({ type: 'number-base', value: 'hex' });
  assert.equal(engine.displayText(), 'FF');
  assert.equal(engine.base, 'hex');

  press(engine, digit('F'));
  assert.equal(engine.displayText(), 'FFF');
  assert.equal(basesOf(engine).dec, '4,095');

  engine.press({ type: 'number-base', value: 'bin' });
  assert.equal(engine.displayText(), '1111 1111 1111');
});

test('digits outside the active base are ignored', () => {
  const octal = run([{ type: 'number-base', value: 'oct' }, ...digits('7'), digit('8'), digit('9')]);
  assert.equal(octal.displayText(), '7');

  const binary = run([{ type: 'number-base', value: 'bin' }, digit('1'), digit('2'), digit('0')]);
  assert.equal(binary.displayText(), '10');

  const decimal = run([digit('9'), digit('A')]);
  assert.equal(decimal.displayText(), '9');
  assert.equal(decimal.isActionAvailable(digit('A')), false);
  assert.equal(decimal.isActionAvailable(digit('9')), true);
});

test('hexadecimal entry reads A to F', () => {
  const engine = run([{ type: 'number-base', value: 'hex' }, ...digits('ABCDEF12')]);
  assert.equal(engine.displayText(), 'ABCD EF12');
  assert.equal(basesOf(engine).dec, '2,882,400,018');
  assert.equal(engine.isActionAvailable(digit('F')), true);
});

test('entry stops at 64 bits', () => {
  const engine = run([{ type: 'number-base', value: 'hex' }, ...digits('FFFFFFFFFFFFFFFFF')]);
  assert.equal(engine.displayText(), 'FFFF FFFF FFFF FFFF');
  assert.equal(basesOf(engine).dec, '-1');
});

test('bitwise keys calculate and show up in the expression', () => {
  const and = run([{ type: 'number-base', value: 'hex' }, ...digits('FF'), operator('and'), digit('F'), EQUALS]);
  assert.equal(and.displayText(), 'F');
  assert.equal(and.expressionText(), 'FF AND F =');

  const shifted = run([...digits('1'), operator('lsh'), digit('8'), EQUALS]);
  assert.equal(shifted.displayText(), '256');

  const inverted = run([digit('0'), { type: 'unary', value: 'not' }]);
  assert.equal(inverted.displayText(), '-1');
  assert.equal(inverted.expressionText(), 'NOT(0)');
  assert.equal(basesOf(inverted).hex, 'FFFF FFFF FFFF FFFF');
});

test('division and negation stay integral', () => {
  assert.equal(run([...digits('7'), operator('divide'), digit('2'), EQUALS]).displayText(), '3');
  assert.equal(run([...digits('10'), operator('mod'), digit('3'), EQUALS]).displayText(), '1');

  const negated = run([...digits('5'), { type: 'negate' }]);
  assert.equal(negated.displayText(), '-5');
  assert.equal(basesOf(negated).hex, 'FFFF FFFF FFFF FFFB');
});

test('keys from the other modes do nothing here', () => {
  const engine = run([
    ...digits('5'),
    { type: 'decimal' },
    digit('2'),
    { type: 'unary', value: 'sqrt' },
    { type: 'unary', value: 'sin' },
    operator('power'),
    { type: 'constant', value: 'pi' },
    { type: 'exponent' },
    { type: 'toggle-fe' },
  ]);
  assert.equal(engine.displayText(), '52');
  assert.equal(engine.expressionText(), '');
  assert.equal(engine.isActionAvailable({ type: 'decimal' }), false);
  assert.equal(engine.isActionAvailable({ type: 'unary', value: 'sqrt' }), false);
  assert.equal(engine.isActionAvailable({ type: 'operator', value: 'and' }), true);
  assert.equal(engine.isActionAvailable({ type: 'paren-open' }), true);
});

test('switching in and out of programmer mode truncates once', () => {
  const engine = new CalculatorEngine();
  press(engine, digit('7'), { type: 'decimal' }, digit('9'));
  assert.equal(engine.displayText(), '7.9');

  engine.press({ type: 'mode', value: 'programmer' });
  assert.equal(engine.displayText(), '7');
  assert.equal(engine.mode, 'programmer');

  engine.press({ type: 'mode', value: 'standard' });
  assert.equal(engine.displayText(), '7');
  assert.equal(engine.isActionAvailable({ type: 'operator', value: 'and' }), false);
});

test('base and mode survive a restore', () => {
  const engine = run([{ type: 'number-base', value: 'hex' }, ...digits('FF'), operator('or'), digit('F'), EQUALS]);
  assert.equal(engine.displayText(), 'FF');

  const restored = CalculatorEngine.restore(JSON.parse(JSON.stringify(engine.toJSON())));
  assert.equal(restored.mode, 'programmer');
  assert.equal(restored.base, 'hex');
  assert.equal(restored.getState().history[0].expression, 'FF OR F =');
  assert.equal(restored.getState().history[0].result, 'FF');
});
