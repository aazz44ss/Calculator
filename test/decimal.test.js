import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Decimal,
  DecimalError,
  acos,
  asin,
  atan,
  cos,
  factorial,
  ln,
  log10,
  quarterTurnIndex,
  sin,
  tan,
} from '../src/decimal.js';
import {
  formatEntry,
  formatExpression,
  formatValue,
  groupDigits,
  toExponentialString,
} from '../src/format.js';

const dec = (text) => Decimal.fromString(text);

/* ------------------------------------------------------------------ *
 * Parsing and representation
 * ------------------------------------------------------------------ */

test('parses integers without a fractional scale', () => {
  const value = dec('1234');
  assert.equal(value.n, 1234n);
  assert.equal(value.scale, 0);
  assert.equal(value.toString(), '1234');
});

test('parses decimals and drops meaningless trailing zeros', () => {
  const value = dec('12.3400');
  assert.equal(value.n, 1234n);
  assert.equal(value.scale, 2);
  assert.equal(value.toString(), '12.34');
});

test('parses negative and bare fractional input', () => {
  assert.equal(dec('-0.5').toString(), '-0.5');
  assert.equal(dec('.25').toString(), '0.25');
  assert.equal(dec('-0').toString(), '0');
});

test('parses exponent notation in both directions', () => {
  assert.equal(dec('1.5e3').toString(), '1500');
  assert.equal(dec('2e-4').toString(), '0.0002');
});

test('rejects input that is not a number', () => {
  assert.throws(() => dec('12..3'), DecimalError);
  assert.throws(() => dec('abc'), DecimalError);
  assert.throws(() => dec('.'), DecimalError);
});

test('fromNumber and from accept the usual JavaScript values', () => {
  assert.equal(Decimal.fromNumber(42).toString(), '42');
  assert.equal(Decimal.from(7n).toString(), '7');
  assert.equal(Decimal.from('0.125').toString(), '0.125');
  assert.equal(Decimal.from(dec('9')).toString(), '9');
});

/* ------------------------------------------------------------------ *
 * Exact arithmetic
 * ------------------------------------------------------------------ */

test('0.1 + 0.2 is exactly 0.3', () => {
  assert.equal(dec('0.1').add(dec('0.2')).toString(), '0.3');
});

test('addition and subtraction stay exact across scales', () => {
  assert.equal(dec('1.005').add(dec('2.0001')).toString(), '3.0051');
  assert.equal(dec('0.3').subtract(dec('0.1')).toString(), '0.2');
  assert.equal(dec('1').subtract(dec('1.0000000001')).toString(), '-0.0000000001');
});

test('0.07 × 100 is exactly 7', () => {
  assert.equal(dec('0.07').multiply(dec('100')).toString(), '7');
});

test('multiplication keeps every digit of both operands', () => {
  assert.equal(dec('1.1').multiply(dec('1.1')).toString(), '1.21');
  assert.equal(dec('0.0000001').multiply(dec('0.0000001')).toString(), '0.00000000000001');
  assert.equal(dec('12345678901234567890').multiply(dec('2')).toString(), '24691357802469135780');
});

test('division runs to 40 decimals', () => {
  const result = dec('2').divide(dec('3'));
  assert.equal(result.scale, 40);
  assert.equal(result.toString(), `0.${'6'.repeat(39)}7`);
});

test('division is exact when it terminates', () => {
  assert.equal(dec('1').divide(dec('8')).toString(), '0.125');
  assert.equal(dec('10').divide(dec('4')).toString(), '2.5');
});

test('division by zero throws', () => {
  assert.throws(() => dec('1').divide(dec('0')), /Cannot divide by zero/);
});

test('rounding is half away from zero, not half to even', () => {
  assert.equal(dec('0.5').roundTo(0).toString(), '1');
  assert.equal(dec('2.5').roundTo(0).toString(), '3');
  assert.equal(dec('-2.5').roundTo(0).toString(), '-3');
  assert.equal(dec('1.005').roundTo(2).toString(), '1.01');
});

test('truncation drops digits without rounding', () => {
  assert.equal(dec('1.999').truncateTo(2).toString(), '1.99');
  assert.equal(dec('-1.999').truncateTo(0).toString(), '-1');
});

test('roundToSignificant keeps 16 digits of a long fraction', () => {
  const result = dec(`0.${'6'.repeat(39)}7`).roundToSignificant(16);
  assert.equal(result.toString(), '0.6666666666666667');
});

test('roundToSignificant preserves magnitude when rounding integers', () => {
  assert.equal(dec('12345678901234567890').roundToSignificant(16).toString(), '12345678901234570000');
});

test('remainder follows truncated division', () => {
  assert.equal(dec('7').remainder(dec('3')).toString(), '1');
  assert.equal(dec('-7').remainder(dec('3')).toString(), '-1');
  assert.equal(dec('7.5').remainder(dec('2')).toString(), '1.5');
});

test('comparison works across different scales', () => {
  assert.equal(dec('1.10').compare(dec('1.1')), 0);
  assert.ok(dec('1.1').equals(dec('1.100')));
  assert.equal(dec('1.09').compare(dec('1.1')), -1);
  assert.equal(dec('2').compare(dec('1.9999')), 1);
});

test('integer powers are exact', () => {
  assert.equal(dec('1.1').power(dec('2')).toString(), '1.21');
  assert.equal(dec('2').power(dec('10')).toString(), '1024');
  assert.equal(dec('0.1').power(dec('3')).toString(), '0.001');
});

test('negative powers use exact reciprocals', () => {
  assert.equal(dec('2').power(dec('-2')).toString(), '0.25');
  assert.throws(() => dec('0').power(dec('-1')), /Cannot divide by zero/);
});

test('fractional powers fall back to doubles and snap', () => {
  assert.equal(dec('9').power(dec('0.5')).toString(), '3');
  assert.equal(dec('8').power(dec('1').divide(dec('3'))).toString(), '2');
  assert.throws(() => dec('-8').power(dec('0.5')), DecimalError);
});

test('square root reaches 40 decimals and stays exact for squares', () => {
  const root = dec('2').sqrt();
  assert.equal(root.scale, 40);
  assert.ok(root.toString().startsWith('1.41421356237309504880168872420969807856'));
  assert.equal(dec('144').sqrt().toString(), '12');
  assert.equal(dec('0.25').sqrt().toString(), '0.5');
});

test('square root of a negative value is invalid input', () => {
  assert.throws(() => dec('-1').sqrt(), /Invalid input/);
});

test('factorial is exact well past double precision', () => {
  assert.equal(factorial(dec('20')).toString(), '2432902008176640000');
  assert.equal(factorial(dec('0')).toString(), '1');
  assert.throws(() => factorial(dec('-1')), /Invalid input/);
  assert.throws(() => factorial(dec('1.5')), /Invalid input/);
});

test('fromDoubleSnapped removes floating point noise', () => {
  assert.equal(Decimal.fromDoubleSnapped(0.30000000000000004).toString(), '0.3');
  assert.equal(Decimal.fromDoubleSnapped(2.0000000000000004).toString(), '2');
  assert.equal(Decimal.fromDoubleSnapped(1.2345678901234567).toString(), '1.23456789012346');
  assert.throws(() => Decimal.fromDoubleSnapped(Number.POSITIVE_INFINITY), DecimalError);
});

/* ------------------------------------------------------------------ *
 * Angles and transcendental functions
 * ------------------------------------------------------------------ */

test('quarterTurnIndex recognises exact quarter turns', () => {
  assert.equal(quarterTurnIndex(dec('0'), 'deg'), 0);
  assert.equal(quarterTurnIndex(dec('90'), 'deg'), 1);
  assert.equal(quarterTurnIndex(dec('180'), 'deg'), 2);
  assert.equal(quarterTurnIndex(dec('-90'), 'deg'), 3);
  assert.equal(quarterTurnIndex(dec('450'), 'deg'), 1);
  assert.equal(quarterTurnIndex(dec('45'), 'deg'), null);
  assert.equal(quarterTurnIndex(dec('89.999999'), 'deg'), null);
});

test('quarter turns are measured in gradians too', () => {
  assert.equal(quarterTurnIndex(dec('100'), 'grad'), 1);
  assert.equal(quarterTurnIndex(dec('200'), 'grad'), 2);
  assert.equal(quarterTurnIndex(dec('100'), 'rad'), null);
});

test('degree trigonometry is exact on the axes', () => {
  assert.equal(sin(dec('180'), 'deg').toString(), '0');
  assert.equal(sin(dec('90'), 'deg').toString(), '1');
  assert.equal(sin(dec('270'), 'deg').toString(), '-1');
  assert.equal(cos(dec('180'), 'deg').toString(), '-1');
  assert.equal(cos(dec('90'), 'deg').toString(), '0');
  assert.equal(tan(dec('180'), 'deg').toString(), '0');
});

test('tangent of a quarter turn is invalid input', () => {
  assert.throws(() => tan(dec('90'), 'deg'), /Invalid input/);
  assert.throws(() => tan(dec('-90'), 'deg'), /Invalid input/);
  assert.throws(() => tan(dec('100'), 'grad'), /Invalid input/);
});

test('gradian trigonometry matches the degree results', () => {
  assert.equal(sin(dec('200'), 'grad').toString(), '0');
  assert.equal(cos(dec('200'), 'grad').toString(), '-1');
  assert.equal(sin(dec('100'), 'grad').toString(), '1');
});

test('off-axis trigonometry is snapped double precision', () => {
  assert.equal(sin(dec('30'), 'deg').toString(), '0.5');
  assert.equal(cos(dec('60'), 'deg').toString(), '0.5');
  assert.equal(tan(dec('45'), 'deg').toString(), '1');
  assert.equal(sin(dec('0'), 'rad').toString(), '0');
});

test('inverse trigonometry answers in the selected unit', () => {
  assert.equal(asin(dec('1'), 'deg').toString(), '90');
  assert.equal(acos(dec('0'), 'deg').toString(), '90');
  assert.equal(atan(dec('1'), 'deg').toString(), '45');
  assert.throws(() => asin(dec('2'), 'deg'), /Invalid input/);
});

test('logarithms are exact for powers of ten and reject non-positive input', () => {
  assert.equal(log10(dec('1000')).toString(), '3');
  assert.equal(log10(dec('0.001')).toString(), '-3');
  assert.equal(log10(dec('2')).toString(), '0.301029995663981');
  assert.equal(ln(dec('1')).toString(), '0');
  assert.throws(() => ln(dec('0')), /Invalid input/);
  assert.throws(() => log10(dec('-5')), /Invalid input/);
});

/* ------------------------------------------------------------------ *
 * Display formatting
 * ------------------------------------------------------------------ */

test('formatValue groups thousands', () => {
  assert.equal(formatValue(dec('1234567')), '1,234,567');
  assert.equal(formatValue(dec('-1234.5')), '-1,234.5');
  assert.equal(formatValue(dec('1234.5678')), '1,234.5678');
});

test('formatValue shows 16 significant digits', () => {
  assert.equal(formatValue(dec(`0.${'6'.repeat(39)}7`)), '0.6666666666666667');
  assert.equal(formatValue(dec('9999999999999999')), '9,999,999,999,999,999');
  assert.equal(formatValue(dec('1234.56789012345678')), '1,234.567890123457');
});

test('formatValue switches to exponential for extreme magnitudes', () => {
  assert.equal(formatValue(dec('1e20')), '1e+20');
  assert.equal(formatValue(dec('1.5e-18')), '1.5e-18');
  assert.equal(formatValue(dec('12345678901234567')), '1.234567890123457e+16');
});

test('formatValue renders zero without a sign', () => {
  assert.equal(formatValue(dec('0')), '0');
  assert.equal(formatValue(dec('-0')), '0');
  assert.equal(formatValue(dec('0'), { fe: true }), '0e+0');
});

test('the F-E toggle forces scientific notation', () => {
  assert.equal(formatValue(dec('1234'), { fe: true }), '1.234e+3');
  assert.equal(formatValue(dec('0.005'), { fe: true }), '5e-3');
  assert.equal(toExponentialString(dec('-250')), '-2.5e+2');
});

test('formatEntry keeps what the user typed', () => {
  assert.equal(formatEntry('1234'), '1,234');
  assert.equal(formatEntry('1234.'), '1,234.');
  assert.equal(formatEntry('0.100'), '0.100');
  assert.equal(formatEntry('-12345.6'), '-12,345.6');
});

test('formatEntry normalises exponent entries', () => {
  assert.equal(formatEntry('2e+0'), '2e+0');
  assert.equal(formatEntry('2e-15'), '2e-15');
  assert.equal(formatEntry('1000e5'), '1,000e+5');
});

test('expression helpers join tokens and group digits', () => {
  assert.equal(formatExpression(['12', '×', '12', '=']), '12 × 12 =');
  assert.equal(formatExpression(['√(9)', '', undefined, '+']), '√(9) +');
  assert.equal(groupDigits('1234567'), '1,234,567');
  assert.equal(groupDigits('123'), '123');
});
