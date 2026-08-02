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

const BYTE = 8n;
const WORD = 16n;
const DWORD = 32n;
const QWORD = 64n;

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

test('values wrap into two\'s complement at the selected width', () => {
  assert.equal(wrapSigned(200n, BYTE), -56n);
  assert.equal(wrapSigned(255n, BYTE), -1n);
  assert.equal(wrapSigned(127n, BYTE), 127n);
  assert.equal(wrapSigned(128n, BYTE), -128n);
  assert.equal(wrapSigned(-1n, QWORD), -1n);
  assert.equal(wrapSigned(65536n, WORD), 0n);
});

test('the unsigned view keeps the raw bit pattern', () => {
  assert.equal(toUnsigned(-1n, BYTE), 255n);
  assert.equal(toUnsigned(-1n, DWORD), 4294967295n);
  assert.equal(toUnsigned(-56n, BYTE), 200n);
  assert.equal(toUnsigned(5n, BYTE), 5n);
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
  assert.equal(formatInteger(255n, 'hex', QWORD), 'FF');
  assert.equal(formatInteger(4294967295n, 'hex', QWORD), 'FFFF FFFF');
  assert.equal(formatInteger(255n, 'bin', QWORD), '1111 1111');
  assert.equal(formatInteger(255n, 'oct', QWORD), '377');
  assert.equal(formatInteger(1234567n, 'dec', QWORD), '1,234,567');
  assert.equal(formatInteger(-1n, 'dec', QWORD), '-1');
  assert.equal(formatInteger(-1n, 'hex', BYTE), 'FF');
  assert.equal(formatInteger(-1n, 'bin', BYTE), '1111 1111');
});

test('input length is capped by the bit width', () => {
  assert.equal(maxDigitsFor('hex', BYTE), 2);
  assert.equal(maxDigitsFor('bin', BYTE), 8);
  assert.equal(maxDigitsFor('oct', BYTE), 3);
  assert.equal(maxDigitsFor('hex', QWORD), 16);
});

test('integer arithmetic truncates and wraps', () => {
  assert.equal(computeInteger(7n, 'divide', 2n, QWORD), 3n);
  assert.equal(computeInteger(-7n, 'divide', 2n, QWORD), -3n);
  assert.equal(computeInteger(7n, 'mod', 2n, QWORD), 1n);
  assert.equal(computeInteger(200n, 'add', 100n, BYTE), 44n);
  assert.equal(computeInteger(1000n, 'multiply', 1000n, WORD), 16960n);
  assert.throws(() => computeInteger(1n, 'divide', 0n, QWORD), /Cannot divide by zero/);
});

test('bitwise operators work on the raw bits', () => {
  assert.equal(computeInteger(0xffn, 'and', 0x0fn, QWORD), 0x0fn);
  assert.equal(computeInteger(0xf0n, 'or', 0x0fn, QWORD), 0xffn);
  assert.equal(computeInteger(0xffn, 'xor', 0x0fn, QWORD), 0xf0n);
  assert.equal(computeInteger(0xffn, 'nand', 0x0fn, BYTE), -16n); // 0xF0
  assert.equal(toUnsigned(computeInteger(0xf0n, 'nor', 0x0fn, BYTE), BYTE), 0x00n);
  assert.equal(notInteger(0n, BYTE), -1n);
  assert.equal(toUnsigned(notInteger(0n, DWORD), DWORD), 4294967295n);
});

test('shifts and rotations respect the width', () => {
  assert.equal(computeInteger(1n, 'lsh', 4n, QWORD), 16n);
  assert.equal(computeInteger(0xffn, 'lsh', 4n, BYTE), -16n); // 0xF0, top bits fall off
  assert.equal(computeInteger(16n, 'rsh', 4n, QWORD), 1n);
  assert.equal(computeInteger(-16n, 'rsh', 2n, QWORD), -4n); // arithmetic shift
  assert.equal(toUnsigned(computeInteger(0x81n, 'rol', 1n, BYTE), BYTE), 0x03n);
  assert.equal(toUnsigned(computeInteger(0x81n, 'ror', 1n, BYTE), BYTE), 0xc0n);
  assert.equal(computeInteger(5n, 'rol', 0n, BYTE), 5n);
  assert.throws(() => computeInteger(1n, 'lsh', -1n, BYTE), ProgrammerError);
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

test('entry stops at the selected bit width', () => {
  const engine = run([{ type: 'number-base', value: 'hex' }, ...digits('FFF')], {
    bitWidth: 'byte',
  });
  assert.equal(engine.displayText(), 'FF');
  assert.equal(basesOf(engine).dec, '-1');
});

test('changing the bit width truncates the value', () => {
  const engine = run(digits('300'));
  assert.equal(engine.displayText(), '300');
  engine.press({ type: 'bit-width', value: 'byte' });
  assert.equal(engine.displayText(), '44');
  assert.equal(engine.bitWidth, 'byte');

  const cycled = run(digits('1'));
  cycled.cycleBitWidth();
  assert.equal(cycled.bitWidth, 'byte');
});

test('bitwise keys calculate and show up in the expression', () => {
  const and = run([{ type: 'number-base', value: 'hex' }, ...digits('FF'), operator('and'), digit('F'), EQUALS]);
  assert.equal(and.displayText(), 'F');
  assert.equal(and.expressionText(), 'FF AND F =');

  const shifted = run([...digits('1'), operator('lsh'), digit('8'), EQUALS]);
  assert.equal(shifted.displayText(), '256');

  const inverted = run([digit('0'), { type: 'unary', value: 'not' }], { bitWidth: 'byte' });
  assert.equal(inverted.displayText(), '-1');
  assert.equal(inverted.expressionText(), 'NOT(0)');
  assert.equal(basesOf(inverted).hex, 'FF');
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

test('base, bit width and mode survive a restore', () => {
  const engine = run([{ type: 'number-base', value: 'hex' }, ...digits('FF'), operator('or'), digit('F'), EQUALS], {
    bitWidth: 'word',
  });
  assert.equal(engine.displayText(), 'FF');

  const restored = CalculatorEngine.restore(JSON.parse(JSON.stringify(engine.toJSON())));
  assert.equal(restored.mode, 'programmer');
  assert.equal(restored.base, 'hex');
  assert.equal(restored.bitWidth, 'word');
  assert.equal(restored.getState().history[0].expression, 'FF OR F =');
  assert.equal(restored.getState().history[0].result, 'FF');
});
