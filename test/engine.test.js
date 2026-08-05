import assert from 'node:assert/strict';
import test from 'node:test';

import { CalculatorEngine } from '../src/engine.js';
import { findActionForKeyboardEvent } from '../src/layout.js';

const digit = (value) => ({ type: 'digit', value });
const operator = (value) => ({ type: 'operator', value });
const unary = (value) => ({ type: 'unary', value });
const DOT = { type: 'decimal' };
const EQUALS = { type: 'equals' };
const PERCENT = { type: 'percent' };

function press(engine, ...actions) {
  for (const action of actions) engine.press(action);
  return engine;
}

function digits(text) {
  return [...text].map((character) => (character === '.' ? DOT : digit(character)));
}

function run(actions, options) {
  return press(new CalculatorEngine(options), ...actions);
}

function scientific(actions) {
  return run(actions, { mode: 'scientific' });
}

test('starts blank at zero', () => {
  const engine = new CalculatorEngine();
  assert.equal(engine.displayText(), '0');
  assert.equal(engine.expressionText(), '');
  assert.equal(engine.getState().mode, 'standard');
  assert.equal(engine.getState().angleUnit, 'deg');
});

test('digit entry replaces the leading zero, allows one point and caps at 16 digits', () => {
  assert.equal(run(digits('007')).displayText(), '7');
  assert.equal(run(digits('0.5')).displayText(), '0.5');
  assert.equal(run([...digits('1.2'), DOT, digit('3')]).displayText(), '1.23');
  assert.equal(run(digits('12345678901234567890')).displayText(), '1,234,567,890,123,456');
});

test('operators run immediately, with no precedence, and can be swapped', () => {
  const engine = run([...digits('2'), operator('add'), ...digits('3'), operator('multiply')]);
  assert.equal(engine.displayText(), '5');
  assert.equal(engine.expressionText(), '2 + 3 ×');

  press(engine, ...digits('4'), EQUALS);
  assert.equal(engine.displayText(), '20');

  const swapped = run([...digits('8'), operator('add'), operator('multiply'), ...digits('2'), EQUALS]);
  assert.equal(swapped.displayText(), '16');
});

test('keypad arithmetic is exact where doubles are not', () => {
  assert.equal(run([...digits('0.1'), operator('add'), ...digits('0.2'), EQUALS]).displayText(), '0.3');
  assert.equal(run([...digits('0.07'), operator('multiply'), ...digits('100'), EQUALS]).displayText(), '7');
  assert.equal(run([...digits('1.1'), operator('multiply'), ...digits('1.1'), EQUALS]).displayText(), '1.21');
  assert.equal(run([...digits('0.3'), operator('subtract'), ...digits('0.1'), EQUALS]).displayText(), '0.2');
});

test('the running result shows up before equals is pressed', () => {
  const engine = new CalculatorEngine();

  // A number on its own is just itself, digits and all.
  press(engine, ...digits('12'));
  assert.equal(engine.displayText(), '12');
  assert.equal(engine.expressionText(), '');

  // An operator alone leaves the first operand on screen.
  press(engine, operator('multiply'));
  assert.equal(engine.displayText(), '12');
  assert.equal(engine.expressionText(), '12 ×');

  // From the first digit of the second operand the display previews the result
  // while the expression keeps showing what was typed.
  press(engine, digit('1'));
  assert.equal(engine.displayText(), '12');
  assert.equal(engine.expressionText(), '12 × 1');
  press(engine, digit('2'));
  assert.equal(engine.displayText(), '144');
  assert.equal(engine.expressionText(), '12 × 12');

  // Equals therefore changes nothing but the expression line.
  press(engine, EQUALS);
  assert.equal(engine.displayText(), '144');
  assert.equal(engine.expressionText(), '12 × 12 =');

  // Backspacing re-previews, and chains preview the running total.
  const chained = run([...digits('2'), operator('add'), ...digits('3'), operator('multiply'), ...digits('45')]);
  assert.equal(chained.displayText(), '225');
  press(chained, { type: 'backspace' });
  assert.equal(chained.displayText(), '20');
  assert.equal(chained.expressionText(), '2 + 3 × 4');

  // Exactness holds in the preview too.
  assert.equal(run([...digits('0.1'), operator('add'), ...digits('0.2')]).displayText(), '0.3');
  assert.equal(run([...digits('0.07'), operator('multiply'), ...digits('100')]).displayText(), '7');
});

test('a preview that cannot be computed stays quiet until equals', () => {
  const dividing = run([...digits('5'), operator('divide'), ...digits('0')]);
  assert.equal(dividing.displayText(), '0', 'no error while the operand is still being typed');
  assert.equal(dividing.expressionText(), '5 ÷ 0');
  assert.equal(dividing.getState().isError, false);

  press(dividing, EQUALS);
  assert.equal(dividing.displayText(), 'Cannot divide by zero');
  assert.equal(dividing.getState().isError, true);

  // Repeating the previous operation is not previewed either: typing after
  // equals shows the digits, not what a second equals would give.
  const repeat = run([...digits('2'), operator('add'), ...digits('3'), EQUALS, ...digits('10')]);
  assert.equal(repeat.displayText(), '10');
  press(repeat, EQUALS);
  assert.equal(repeat.displayText(), '13');
});

test('the settled expression keeps showing the finished calculation', () => {
  const engine = run([...digits('12'), operator('multiply'), ...digits('12'), EQUALS]);
  assert.equal(engine.displayText(), '144');
  assert.equal(engine.expressionText(), '12 × 12 =');
  assert.equal(engine.settledExpression, '12 × 12 =');

  press(engine, operator('add'));
  assert.equal(engine.expressionText(), '144 +');
});

test('typing after equals starts a new calculation', () => {
  const engine = run([...digits('12'), operator('multiply'), ...digits('12'), EQUALS]);
  press(engine, ...digits('7'));
  assert.equal(engine.displayText(), '7');
  assert.equal(engine.expressionText(), '');
});

test('equals repeats the previous operator and operand', () => {
  const engine = run([...digits('2'), operator('add'), ...digits('3'), EQUALS]);
  assert.equal(engine.displayText(), '5');
  press(engine, EQUALS);
  assert.equal(engine.displayText(), '8');
  assert.equal(engine.expressionText(), '5 + 3 =');
  press(engine, EQUALS);
  assert.equal(engine.displayText(), '11');
});

test('percent takes a share of the first operand for plus and minus', () => {
  assert.equal(run([...digits('50'), operator('add'), ...digits('10'), PERCENT, EQUALS]).displayText(), '55');
  assert.equal(run([...digits('200'), operator('subtract'), ...digits('10'), PERCENT, EQUALS]).displayText(), '180');

  // The share lands in the expression, the display previews the total.
  const engine = run([...digits('50'), operator('add'), ...digits('10'), PERCENT]);
  assert.equal(engine.expressionText(), '50 + 5');
  assert.equal(engine.displayText(), '55');
});

test('percent is a plain division by 100 for times and divide', () => {
  assert.equal(run([...digits('50'), operator('multiply'), ...digits('10'), PERCENT, EQUALS]).displayText(), '5');
  assert.equal(run([...digits('50'), operator('divide'), ...digits('10'), PERCENT, EQUALS]).displayText(), '500');
  assert.equal(run([...digits('50'), PERCENT]).displayText(), '0.5');
});

test('unary functions apply immediately and show up in the expression', () => {
  const engine = run([...digits('9'), unary('sqrt')]);
  assert.equal(engine.displayText(), '3');
  assert.equal(engine.expressionText(), '√(9)');

  press(engine, operator('add'), ...digits('1'), EQUALS);
  assert.equal(engine.displayText(), '4');
  assert.equal(engine.expressionText(), '√(9) + 1 =');

  assert.equal(run([...digits('5'), unary('sqr')]).displayText(), '25');
  assert.equal(run([...digits('4'), unary('reciprocal')]).displayText(), '0.25');
});

test('an error blocks further input until it is cleared', () => {
  const engine = run([...digits('5'), operator('divide'), ...digits('0'), EQUALS]);
  assert.equal(engine.displayText(), 'Cannot divide by zero');
  assert.equal(engine.expressionText(), '5 ÷ 0');
  assert.equal(engine.getState().isError, true);

  press(engine, ...digits('7'), operator('add'));
  assert.equal(engine.displayText(), 'Cannot divide by zero');

  press(engine, { type: 'clear-entry' }, ...digits('7'));
  assert.equal(engine.displayText(), '7');
  assert.equal(engine.getState().isError, false);
});

test('CE keeps the pending operator while C keeps the history', () => {
  const engine = run([...digits('5'), operator('add'), ...digits('3'), { type: 'clear-entry' }]);
  assert.equal(engine.displayText(), '0');
  press(engine, ...digits('2'), EQUALS);
  assert.equal(engine.displayText(), '7');

  press(engine, { type: 'clear' });
  assert.equal(engine.displayText(), '0');
  assert.equal(engine.expressionText(), '');
  assert.equal(engine.getState().history.length, 1);
});

test('backspace and sign toggle edit the current value', () => {
  const engine = run(digits('123'));
  press(engine, { type: 'backspace' });
  assert.equal(engine.displayText(), '12');

  press(engine, { type: 'negate' });
  assert.equal(engine.displayText(), '-12');
  press(engine, { type: 'negate' });
  assert.equal(engine.displayText(), '12');

  const computed = run([...digits('9'), unary('sqrt'), { type: 'negate' }]);
  assert.equal(computed.displayText(), '-3');
  assert.equal(computed.expressionText(), 'negate(√(9))');
});

test('brackets stack, report their depth and close themselves on equals', () => {
  const engine = scientific([
    ...digits('2'),
    operator('multiply'),
    { type: 'paren-open' },
    ...digits('3'),
    operator('add'),
    ...digits('4'),
  ]);
  assert.equal(engine.parenDepth, 1);
  assert.equal(engine.expressionText(), '2 × ( 3 + 4');

  press(engine, { type: 'paren-close' });
  assert.equal(engine.expressionText(), '2 × (3 + 4)');
  assert.equal(engine.displayText(), '14', 'the preview folds the brackets');

  press(engine, EQUALS);
  assert.equal(engine.displayText(), '14');

  const autoClosed = scientific([
    ...digits('2'),
    operator('multiply'),
    { type: 'paren-open' },
    ...digits('3'),
    operator('add'),
    ...digits('4'),
    EQUALS,
  ]);
  assert.equal(autoClosed.displayText(), '14');
  assert.equal(autoClosed.expressionText(), '2 × (3 + 4) =');
  assert.equal(autoClosed.parenDepth, 0);

  const nested = scientific([
    { type: 'paren-open' },
    ...digits('2'),
    operator('add'),
    { type: 'paren-open' },
    ...digits('3'),
    operator('multiply'),
    ...digits('4'),
  ]);
  assert.equal(nested.parenDepth, 2);
  press(nested, EQUALS);
  assert.equal(nested.displayText(), '14');
});

test('scientific-only keys do nothing in standard mode', () => {
  const engine = run([
    ...digits('5'),
    unary('sin'),
    unary('ln'),
    { type: 'paren-open' },
    { type: 'constant', value: 'pi' },
    { type: 'exponent' },
    { type: 'toggle-fe' },
    { type: 'toggle-second' },
    { type: 'angle-unit', value: 'rad' },
    operator('mod'),
  ]);
  assert.equal(engine.displayText(), '5');
  assert.equal(engine.expressionText(), '');
  assert.equal(engine.parenDepth, 0);
  assert.equal(engine.fe, false);
  assert.equal(engine.second, false);
  assert.equal(engine.angleUnit, 'deg');

  // The same keys work once the scientific keypad is active.
  press(engine, { type: 'mode', value: 'scientific' }, unary('sin'));
  assert.equal(engine.displayText(), '0.0871557427476582');
});

test('the angle unit drives trigonometry and tan of a quarter turn is invalid', () => {
  assert.equal(scientific([...digits('180'), unary('sin')]).displayText(), '0');
  assert.equal(scientific([...digits('180'), unary('cos')]).displayText(), '-1');
  assert.equal(scientific([...digits('90'), unary('tan')]).displayText(), 'Invalid input');

  const radians = scientific([{ type: 'angle-unit', value: 'rad' }, ...digits('0'), unary('cos')]);
  assert.equal(radians.displayText(), '1');
  assert.equal(radians.angleUnit, 'rad');

  const gradians = scientific([{ type: 'angle-unit', value: 'grad' }, ...digits('200'), unary('sin')]);
  assert.equal(gradians.displayText(), '0');
});

test('history records finished calculations and can recall one', () => {
  const engine = run([...digits('2'), operator('add'), ...digits('3'), EQUALS]);
  press(engine, ...digits('4'), operator('multiply'), ...digits('5'), EQUALS);

  const { history } = engine.getState();
  assert.equal(history.length, 2);
  assert.equal(history[0].expression, '4 × 5 =');
  assert.equal(history[0].result, '20');
  assert.equal(history[1].expression, '2 + 3 =');

  press(engine, { type: 'clear' }, { type: 'history-recall', value: history[1].id });
  assert.equal(engine.displayText(), '5');
  assert.equal(engine.expressionText(), '2 + 3 =');

  press(engine, { type: 'history-clear' });
  assert.equal(engine.getState().history.length, 0);
});

test('state survives a serialise and restore round trip', () => {
  const engine = scientific([
    { type: 'angle-unit', value: 'rad' },
    ...digits('7'),
    operator('add'),
    ...digits('1'),
    EQUALS,
  ]);

  const restored = CalculatorEngine.restore(JSON.parse(JSON.stringify(engine.toJSON())));
  assert.equal(restored.mode, 'scientific');
  assert.equal(restored.angleUnit, 'rad');
  assert.equal(restored.getState().history[0].expression, '7 + 1 =');
  assert.equal(restored.getState().history[0].result, '8');
  assert.equal(CalculatorEngine.restore(null).mode, 'standard');
  assert.equal(CalculatorEngine.restore('nonsense').mode, 'standard');
});

test('F-E switches the display to scientific notation and exp types an exponent', () => {
  const engine = scientific([...digits('1234'), EQUALS, { type: 'toggle-fe' }]);
  assert.equal(engine.displayText(), '1.234e+3');
  press(engine, { type: 'toggle-fe' });
  assert.equal(engine.displayText(), '1,234');

  const typed = scientific([...digits('2'), { type: 'exponent' }, ...digits('5')]);
  assert.equal(typed.displayText(), '2e+5');
  press(typed, EQUALS);
  assert.equal(typed.displayText(), '200,000');

  const negativeExponent = scientific([
    ...digits('3'),
    { type: 'exponent' },
    ...digits('4'),
    { type: 'negate' },
    EQUALS,
  ]);
  assert.equal(negativeExponent.displayText(), '0.0003');
});

test('mod and power behave like operators in scientific mode', () => {
  assert.equal(scientific([...digits('7'), operator('mod'), ...digits('3'), EQUALS]).displayText(), '1');
  assert.equal(scientific([...digits('2'), operator('power'), ...digits('10'), EQUALS]).displayText(), '1,024');
  assert.equal(scientific([...digits('27'), operator('root'), ...digits('3'), EQUALS]).displayText(), '3');
  assert.equal(
    scientific([...digits('2'), operator('power'), ...digits('10'), EQUALS]).expressionText(),
    '2 ^ 10 =',
  );
});

test('keyboard bindings follow the Windows shortcuts', () => {
  const lookup = (event, mode = 'standard') => findActionForKeyboardEvent(event, mode);

  assert.deepEqual(lookup({ key: 'Escape' }).action, { type: 'clear' });
  assert.deepEqual(lookup({ key: 'Delete' }).action, { type: 'clear-entry' });
  assert.deepEqual(lookup({ key: 'Backspace' }).action, { type: 'backspace' });
  assert.deepEqual(lookup({ key: 'Enter' }).action, { type: 'equals' });
  assert.deepEqual(lookup({ key: '=' }).action, { type: 'equals' });
  assert.deepEqual(lookup({ key: 'r' }).action, { type: 'unary', value: 'reciprocal' });
  assert.deepEqual(lookup({ key: 'Q' }).action, { type: 'unary', value: 'sqr' });
  assert.deepEqual(lookup({ key: '@' }).action, { type: 'unary', value: 'sqrt' });
  assert.deepEqual(lookup({ key: 'F9' }).action, { type: 'negate' });
  assert.deepEqual(lookup({ key: '%' }).action, { type: 'percent' });
  assert.deepEqual(lookup({ key: '7' }).action, { type: 'digit', value: '7' });
  assert.deepEqual(lookup({ key: '*' }).action, { type: 'operator', value: 'multiply' });
});

test('keyboard panel, mode and scientific bindings are separated by modifier and mode', () => {
  const lookup = (event, mode = 'standard') => findActionForKeyboardEvent(event, mode);

  assert.deepEqual(lookup({ key: 'h' }).action, { type: 'ui-toggle-history' });
  assert.deepEqual(lookup({ key: 'h', ctrlKey: true }).action, { type: 'ui-toggle-history' });
  assert.deepEqual(lookup({ key: '1', altKey: true }).action, { type: 'mode', value: 'standard' });
  assert.deepEqual(lookup({ key: '2', altKey: true }).action, { type: 'mode', value: 'scientific' });
  assert.deepEqual(lookup({ key: '3', altKey: true }).action, { type: 'mode', value: 'programmer' });

  // Trigonometry and brackets only exist on the scientific keypad.
  assert.equal(lookup({ key: 's' }), null);
  assert.equal(lookup({ key: '(' }), null);
  assert.equal(lookup({ key: 'F4' }), null);
  assert.deepEqual(lookup({ key: 's' }, 'scientific').action, { type: 'unary', value: 'sin' });
  assert.deepEqual(lookup({ key: '(' }, 'scientific').action, { type: 'paren-open' });

  // The same function keys mean different things per keypad, as on Windows.
  assert.deepEqual(lookup({ key: 'F4' }, 'scientific').action, { type: 'angle-unit', value: 'rad' });
  assert.deepEqual(lookup({ key: 'F5' }, 'programmer').action, { type: 'number-base', value: 'hex' });
  assert.deepEqual(lookup({ key: 'd' }, 'programmer').action, { type: 'digit', value: 'D' });
  assert.deepEqual(lookup({ key: '&' }, 'programmer').action, { type: 'operator', value: 'and' });
});
