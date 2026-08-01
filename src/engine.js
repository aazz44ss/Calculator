/**
 * Calculator state machine.
 *
 * Pure logic: this file never touches the DOM, so all of the arithmetic and
 * key handling can be exercised straight from Node.
 *
 * Semantics follow Windows Calculator:
 *   - immediate execution, no operator precedence (2 + 3 × 4 = 20)
 *   - "=" repeats the previous operator and operand
 *   - "+"/"−" treat a percentage as a share of the first operand (50 + 10% = 55)
 *     while "×"/"÷" treat it as a plain division by 100 (50 × 10% = 5)
 */

import {
  ANGLE_UNITS,
  Decimal,
  DecimalError,
  E,
  PI,
  acos,
  acosh,
  asin,
  asinh,
  atan,
  atanh,
  cos,
  cosh,
  exp,
  factorial,
  ln,
  log10,
  sin,
  sinh,
  tan,
  tanh,
} from './decimal.js';
import { OPERATOR_SYMBOLS, formatEntry, formatExpression, formatValue } from './format.js';

const MAX_ENTRY_DIGITS = 16;
const MAX_RESULT_DIGITS = 10000;
const HISTORY_LIMIT = 50;

export const ERRORS = {
  DIVIDE_BY_ZERO: 'Cannot divide by zero',
  INVALID_INPUT: 'Invalid input',
  OVERFLOW: 'Overflow',
};

/** Actions that only exist in scientific mode. */
const SCIENTIFIC_ONLY_TYPES = new Set([
  'paren-open',
  'paren-close',
  'exponent',
  'constant',
  'toggle-second',
  'toggle-hyp',
  'toggle-fe',
  'angle-unit',
]);
const SCIENTIFIC_ONLY_OPERATORS = new Set(['power', 'root', 'mod']);
const STANDARD_UNARY_FUNCTIONS = new Set(['sqr', 'sqrt', 'reciprocal']);

/** Actions still accepted while an error is displayed. */
const ERROR_SAFE_TYPES = new Set([
  'clear',
  'clear-entry',
  'backspace',
  'mode',
  'angle-unit',
  'toggle-second',
  'toggle-hyp',
  'toggle-fe',
  'memory-clear',
  'history-clear',
]);

const UNARY_TOKENS = {
  sqr: (operand) => `sqr(${operand})`,
  cube: (operand) => `cube(${operand})`,
  sqrt: (operand) => `√(${operand})`,
  cbrt: (operand) => `∛(${operand})`,
  reciprocal: (operand) => `1/(${operand})`,
  abs: (operand) => `|${operand}|`,
  factorial: (operand) => `fact(${operand})`,
  negate: (operand) => `negate(${operand})`,
  exp10: (operand) => `10^(${operand})`,
  exp2: (operand) => `2^(${operand})`,
  expE: (operand) => `e^(${operand})`,
  ln: (operand) => `ln(${operand})`,
  log10: (operand) => `log(${operand})`,
  sin: (operand) => `sin(${operand})`,
  cos: (operand) => `cos(${operand})`,
  tan: (operand) => `tan(${operand})`,
  asin: (operand) => `sin⁻¹(${operand})`,
  acos: (operand) => `cos⁻¹(${operand})`,
  atan: (operand) => `tan⁻¹(${operand})`,
  sinh: (operand) => `sinh(${operand})`,
  cosh: (operand) => `cosh(${operand})`,
  tanh: (operand) => `tanh(${operand})`,
  asinh: (operand) => `sinh⁻¹(${operand})`,
  acosh: (operand) => `cosh⁻¹(${operand})`,
  atanh: (operand) => `tanh⁻¹(${operand})`,
};

const UNARY_FUNCTIONS = {
  sqr: (value) => value.multiply(value),
  cube: (value) => value.multiply(value).multiply(value),
  sqrt: (value) => value.sqrt(),
  cbrt: (value) => Decimal.fromDoubleSnapped(Math.cbrt(value.toNumber())),
  reciprocal: (value) => Decimal.ONE.divide(value),
  abs: (value) => value.abs(),
  factorial: (value) => factorial(value),
  negate: (value) => value.negate(),
  exp10: (value) => Decimal.TEN.power(value),
  exp2: (value) => Decimal.TWO.power(value),
  expE: (value) => exp(value),
  ln: (value) => ln(value),
  log10: (value) => log10(value),
  sin: (value, unit) => sin(value, unit),
  cos: (value, unit) => cos(value, unit),
  tan: (value, unit) => tan(value, unit),
  asin: (value, unit) => asin(value, unit),
  acos: (value, unit) => acos(value, unit),
  atan: (value, unit) => atan(value, unit),
  sinh: (value) => sinh(value),
  cosh: (value) => cosh(value),
  tanh: (value) => tanh(value),
  asinh: (value) => asinh(value),
  acosh: (value) => acosh(value),
  atanh: (value) => atanh(value),
};

function entryToDecimal(entry) {
  let text = entry;
  if (text === '' || text === '-') text = '0';
  text = text.replace(/e([+-]?)$/i, 'e$10');
  if (text.endsWith('.')) text = text.slice(0, -1);
  return Decimal.fromString(text);
}

function countEntryDigits(entry) {
  const mantissa = entry.split(/e/i)[0];
  const digits = mantissa.replace(/[-.]/g, '');
  const trimmed = digits.replace(/^0+/, '');
  return trimmed.length;
}

let historySequence = 0;

function nextId(prefix) {
  historySequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${historySequence}`;
}

export class CalculatorEngine {
  constructor(options = {}) {
    this.mode = options.mode === 'scientific' ? 'scientific' : 'standard';
    this.angleUnit = ANGLE_UNITS.includes(options.angleUnit) ? options.angleUnit : 'deg';
    this.second = Boolean(options.second);
    this.hyp = Boolean(options.hyp);
    this.fe = Boolean(options.fe);
    this.memory = (options.memory ?? []).map((item) => Decimal.from(item));
    this.history = (options.history ?? []).map((item) => ({
      id: item.id ?? nextId('history'),
      expression: String(item.expression ?? ''),
      result: Decimal.from(item.result ?? 0),
    }));
    this.reset();
  }

  reset() {
    this.value = Decimal.ZERO;
    this.entry = null;
    this.operandExpression = null;
    this.accumulator = null;
    this.pendingOperator = null;
    this.hasFreshOperand = false;
    this.tokens = [];
    this.parenStack = [];
    this.settledExpression = null;
    this.lastOperation = null;
    this.error = null;
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Derived values
   * ---------------------------------------------------------------- */

  currentValue() {
    return this.entry === null ? this.value : entryToDecimal(this.entry);
  }

  currentOperandToken() {
    if (this.operandExpression !== null) return this.operandExpression;
    if (this.entry !== null) return formatEntry(this.entry);
    return formatValue(this.value, { fe: this.fe });
  }

  displayText() {
    if (this.error) return this.error;
    if (this.entry !== null) return formatEntry(this.entry);
    return formatValue(this.value, { fe: this.fe });
  }

  expressionText() {
    if (this.error && this.settledExpression) return this.settledExpression;
    if (this.settledExpression) return this.settledExpression;
    const parts = [];
    for (const frame of this.parenStack) parts.push(...frame.tokens, '(');
    parts.push(...this.tokens);
    if (this.operandExpression !== null) parts.push(this.operandExpression);
    return formatExpression(parts);
  }

  get parenDepth() {
    return this.parenStack.length;
  }

  getState() {
    return {
      display: this.displayText(),
      expression: this.expressionText(),
      isError: Boolean(this.error),
      mode: this.mode,
      angleUnit: this.angleUnit,
      second: this.second,
      hyp: this.hyp,
      fe: this.fe,
      parenDepth: this.parenDepth,
      hasMemory: this.memory.length > 0,
      memory: this.memory.map((item, index) => ({
        index,
        text: formatValue(item, { fe: this.fe }),
      })),
      history: this.history.map((item) => ({
        id: item.id,
        expression: item.expression,
        result: formatValue(item.result, { fe: this.fe }),
      })),
    };
  }

  toJSON() {
    return {
      mode: this.mode,
      angleUnit: this.angleUnit,
      second: this.second,
      hyp: this.hyp,
      fe: this.fe,
      memory: this.memory.map((item) => item.toString()),
      history: this.history.map((item) => ({
        id: item.id,
        expression: item.expression,
        result: item.result.toString(),
      })),
    };
  }

  static restore(data) {
    if (!data || typeof data !== 'object') return new CalculatorEngine();
    try {
      return new CalculatorEngine(data);
    } catch {
      return new CalculatorEngine();
    }
  }

  /* ---------------------------------------------------------------- *
   * Dispatch
   * ---------------------------------------------------------------- */

  /**
   * @param {{ type: string, value?: string | number }} action
   */
  press(action) {
    if (!action || typeof action.type !== 'string') return this;
    if (!this.isActionAllowed(action)) return this;

    const { type, value } = action;
    switch (type) {
      case 'digit':
        this.inputDigit(String(value));
        break;
      case 'decimal':
        this.inputDecimal();
        break;
      case 'exponent':
        this.inputExponent();
        break;
      case 'operator':
        this.applyOperator(String(value));
        break;
      case 'unary':
        this.applyUnary(String(value));
        break;
      case 'negate':
        this.negate();
        break;
      case 'percent':
        this.applyPercent();
        break;
      case 'equals':
        this.equals();
        break;
      case 'clear':
        this.clearAll();
        break;
      case 'clear-entry':
        this.clearEntry();
        break;
      case 'backspace':
        this.backspace();
        break;
      case 'paren-open':
        this.openParen();
        break;
      case 'paren-close':
        this.closeParen();
        break;
      case 'constant':
        this.inputConstant(String(value));
        break;
      case 'memory-store':
        this.memoryStore();
        break;
      case 'memory-add':
        this.memoryAdd(1, value);
        break;
      case 'memory-subtract':
        this.memoryAdd(-1, value);
        break;
      case 'memory-recall':
        this.memoryRecall(value);
        break;
      case 'memory-clear':
        this.memoryClear(value);
        break;
      case 'history-recall':
        this.recallHistory(String(value));
        break;
      case 'history-clear':
        this.clearHistory();
        break;
      case 'mode':
        this.setMode(String(value));
        break;
      case 'angle-unit':
        this.setAngleUnit(String(value));
        break;
      case 'toggle-second':
        this.second = !this.second;
        break;
      case 'toggle-hyp':
        this.hyp = !this.hyp;
        break;
      case 'toggle-fe':
        this.fe = !this.fe;
        break;
      default:
        break;
    }
    return this;
  }

  isActionAllowed(action) {
    const { type, value } = action;
    if (this.error && !ERROR_SAFE_TYPES.has(type)) return false;
    if (this.mode === 'scientific') return true;

    if (SCIENTIFIC_ONLY_TYPES.has(type)) return false;
    if (type === 'operator' && SCIENTIFIC_ONLY_OPERATORS.has(String(value))) return false;
    if (type === 'unary' && !STANDARD_UNARY_FUNCTIONS.has(String(value))) return false;
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Entry
   * ---------------------------------------------------------------- */

  startNewCalculationIfSettled() {
    if (this.settledExpression === null) return;
    this.settledExpression = null;
    this.tokens = [];
    this.accumulator = null;
    this.pendingOperator = null;
    this.operandExpression = null;
  }

  inputDigit(digit) {
    if (!/^[0-9]$/.test(digit)) return;
    this.startNewCalculationIfSettled();
    this.operandExpression = null;

    if (this.entry === null) {
      this.entry = digit === '0' ? '0' : digit;
      this.hasFreshOperand = true;
      return;
    }

    const [mantissa, exponent] = this.entry.split(/e/i);
    if (exponent !== undefined) {
      const sign = exponent.startsWith('-') ? '-' : '';
      const digits = `${exponent.replace(/^[+-]/, '')}${digit}`.replace(/^0+(?=\d)/, '');
      if (digits.length > 4) return;
      this.entry = `${mantissa}e${sign}${digits}`;
      return;
    }

    if (countEntryDigits(this.entry) >= MAX_ENTRY_DIGITS) return;
    if (this.entry === '0') this.entry = digit;
    else if (this.entry === '-0') this.entry = `-${digit}`;
    else this.entry += digit;
    this.hasFreshOperand = true;
  }

  inputDecimal() {
    this.startNewCalculationIfSettled();
    this.operandExpression = null;
    if (this.entry === null) {
      this.entry = '0.';
      this.hasFreshOperand = true;
      return;
    }
    if (/e/i.test(this.entry)) return;
    if (this.entry.includes('.')) return;
    this.entry += '.';
    this.hasFreshOperand = true;
  }

  inputExponent() {
    this.startNewCalculationIfSettled();
    if (this.entry === null) this.entry = this.value.toString();
    if (/e/i.test(this.entry)) return;
    this.entry = `${this.entry.replace(/\.$/, '')}e+0`;
    this.operandExpression = null;
    this.hasFreshOperand = true;
  }

  inputConstant(name) {
    const constant = name === 'e' ? E : PI;
    this.startNewCalculationIfSettled();
    this.value = constant;
    this.entry = null;
    this.operandExpression = null;
    this.hasFreshOperand = true;
  }

  negate() {
    if (this.entry !== null) {
      const [mantissa, exponent] = this.entry.split(/e/i);
      if (exponent !== undefined) {
        const digits = exponent.replace(/^[+-]/, '');
        const sign = exponent.startsWith('-') ? '+' : '-';
        this.entry = `${mantissa}e${sign}${digits}`;
      } else if (mantissa.startsWith('-')) {
        this.entry = mantissa.slice(1);
      } else if (mantissa !== '0') {
        this.entry = `-${mantissa}`;
      }
      return;
    }
    if (this.value.isZero()) return;
    const token = this.currentOperandToken();
    this.value = this.value.negate();
    this.operandExpression = UNARY_TOKENS.negate(token);
    this.settledExpression = null;
    this.hasFreshOperand = true;
  }

  /* ---------------------------------------------------------------- *
   * Arithmetic
   * ---------------------------------------------------------------- */

  compute(left, operator, right) {
    switch (operator) {
      case 'add':
        return left.add(right);
      case 'subtract':
        return left.subtract(right);
      case 'multiply':
        return left.multiply(right);
      case 'divide':
        return left.divide(right);
      case 'power':
        return left.power(right);
      case 'root':
        if (right.isZero()) throw new DecimalError(ERRORS.INVALID_INPUT);
        return left.power(Decimal.ONE.divide(right));
      case 'mod':
        return left.remainder(right);
      default:
        throw new DecimalError(ERRORS.INVALID_INPUT);
    }
  }

  guardResult(result) {
    if (result.integerDigitCount() > MAX_RESULT_DIGITS) {
      throw new DecimalError(ERRORS.OVERFLOW);
    }
    return result;
  }

  runGuarded(work) {
    try {
      work();
    } catch (error) {
      if (error instanceof DecimalError) {
        this.error = error.message;
        this.entry = null;
        this.operandExpression = null;
        this.accumulator = null;
        this.pendingOperator = null;
        this.hasFreshOperand = false;
        this.tokens = [];
        this.parenStack = [];
        this.value = Decimal.ZERO;
        return;
      }
      throw error;
    }
  }

  applyOperator(operator) {
    if (!Object.prototype.hasOwnProperty.call(OPERATOR_SYMBOLS, operator)) return;
    const symbol = OPERATOR_SYMBOLS[operator];

    this.runGuarded(() => {
      const value = this.currentValue();
      const token = this.currentOperandToken();

      if (this.pendingOperator && this.hasFreshOperand) {
        const result = this.guardResult(this.compute(this.accumulator, this.pendingOperator, value));
        this.tokens.push(token, symbol);
        this.accumulator = result;
        this.value = result;
      } else if (this.pendingOperator) {
        this.tokens[this.tokens.length - 1] = symbol;
      } else {
        this.settledExpression = null;
        this.accumulator = value;
        this.tokens = [token, symbol];
      }

      this.pendingOperator = operator;
      this.entry = null;
      this.operandExpression = null;
      this.hasFreshOperand = false;
      this.settledExpression = null;
    });
  }

  applyUnary(name) {
    const fn = UNARY_FUNCTIONS[name];
    if (!fn) return;

    this.runGuarded(() => {
      const value = this.currentValue();
      const token = this.currentOperandToken();
      const result = this.guardResult(fn(value, this.angleUnit));
      this.value = result;
      this.entry = null;
      this.operandExpression = (UNARY_TOKENS[name] ?? ((operand) => `${name}(${operand})`))(token);
      this.settledExpression = null;
      this.hasFreshOperand = true;
    });
  }

  applyPercent() {
    this.runGuarded(() => {
      const value = this.currentValue();
      const relative = this.pendingOperator === 'add' || this.pendingOperator === 'subtract';
      const result = relative && this.accumulator
        ? this.accumulator.multiply(value).divide(Decimal.HUNDRED)
        : value.divide(Decimal.HUNDRED);
      this.value = result;
      this.entry = null;
      this.operandExpression = formatValue(result, { fe: this.fe });
      this.settledExpression = null;
      this.hasFreshOperand = true;
    });
  }

  equals() {
    this.runGuarded(() => {
      while (this.parenStack.length > 0) this.closeParenInternal();

      const value = this.currentValue();
      const token = this.currentOperandToken();
      let result;
      let parts;

      if (this.pendingOperator) {
        result = this.guardResult(this.compute(this.accumulator, this.pendingOperator, value));
        this.lastOperation = { operator: this.pendingOperator, operand: value };
        parts = [...this.tokens, token, '='];
      } else if (this.lastOperation) {
        const { operator, operand } = this.lastOperation;
        result = this.guardResult(this.compute(value, operator, operand));
        parts = [token, OPERATOR_SYMBOLS[operator], formatValue(operand, { fe: this.fe }), '='];
      } else {
        result = value;
        parts = [token, '='];
      }

      this.value = result;
      this.entry = null;
      this.operandExpression = null;
      this.accumulator = null;
      this.pendingOperator = null;
      this.hasFreshOperand = false;
      this.tokens = [];
      this.settledExpression = formatExpression(parts);
      this.pushHistory(this.settledExpression, result);
    });
  }

  /* ---------------------------------------------------------------- *
   * Brackets
   * ---------------------------------------------------------------- */

  openParen() {
    this.startNewCalculationIfSettled();
    this.parenStack.push({
      accumulator: this.accumulator,
      pendingOperator: this.pendingOperator,
      tokens: this.tokens,
    });
    this.accumulator = null;
    this.pendingOperator = null;
    this.tokens = [];
    this.entry = null;
    this.value = Decimal.ZERO;
    this.operandExpression = null;
    this.hasFreshOperand = false;
  }

  closeParen() {
    if (this.parenStack.length === 0) return;
    this.runGuarded(() => this.closeParenInternal());
  }

  closeParenInternal() {
    if (this.parenStack.length === 0) return;
    const value = this.currentValue();
    const innerParts = [...this.tokens, this.currentOperandToken()];
    const result = this.pendingOperator
      ? this.guardResult(this.compute(this.accumulator, this.pendingOperator, value))
      : value;

    const frame = this.parenStack.pop();
    this.accumulator = frame.accumulator;
    this.pendingOperator = frame.pendingOperator;
    this.tokens = frame.tokens;
    this.value = result;
    this.entry = null;
    this.operandExpression = `(${formatExpression(innerParts)})`;
    this.hasFreshOperand = true;
  }

  /* ---------------------------------------------------------------- *
   * Clearing
   * ---------------------------------------------------------------- */

  clearAll() {
    // Memory, history, mode and the toggles survive "C", exactly like Windows.
    return this.reset();
  }

  clearEntry() {
    this.error = null;
    this.entry = null;
    this.value = Decimal.ZERO;
    this.operandExpression = null;
    this.hasFreshOperand = false;
    if (this.settledExpression) {
      this.settledExpression = null;
      this.tokens = [];
      this.accumulator = null;
      this.pendingOperator = null;
    }
    return this;
  }

  backspace() {
    if (this.error) {
      this.error = null;
      this.value = Decimal.ZERO;
      this.entry = null;
      return this;
    }
    if (this.settledExpression) {
      this.startNewCalculationIfSettled();
      return this;
    }
    if (this.entry === null) return this;

    if (/e/i.test(this.entry)) {
      const [mantissa, exponent] = this.entry.split(/e/i);
      const digits = exponent.replace(/^[+-]/, '');
      if (digits.length > 1) {
        const sign = exponent.startsWith('-') ? '-' : '+';
        this.entry = `${mantissa}e${sign}${digits.slice(0, -1)}`;
      } else {
        this.entry = mantissa;
      }
      return this;
    }

    const trimmed = this.entry.slice(0, -1);
    if (trimmed === '' || trimmed === '-') {
      this.entry = null;
      this.value = Decimal.ZERO;
      this.hasFreshOperand = this.pendingOperator === null;
    } else {
      this.entry = trimmed;
    }
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Memory
   * ---------------------------------------------------------------- */

  memoryStore() {
    this.memory.unshift(this.currentValue());
    this.hasFreshOperand = true;
    return this;
  }

  memoryAdd(direction, index) {
    const value = this.currentValue();
    const delta = direction < 0 ? value.negate() : value;
    if (this.memory.length === 0) {
      this.memory.unshift(delta);
      return this;
    }
    const target = Number.isInteger(index) ? index : 0;
    if (target < 0 || target >= this.memory.length) return this;
    this.memory[target] = this.memory[target].add(delta);
    return this;
  }

  memoryRecall(index) {
    const target = Number.isInteger(index) ? index : 0;
    if (target < 0 || target >= this.memory.length) return this;
    this.startNewCalculationIfSettled();
    this.value = this.memory[target];
    this.entry = null;
    this.operandExpression = null;
    this.hasFreshOperand = true;
    return this;
  }

  memoryClear(index) {
    if (Number.isInteger(index)) {
      if (index >= 0 && index < this.memory.length) this.memory.splice(index, 1);
      return this;
    }
    this.memory = [];
    return this;
  }

  /* ---------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------- */

  pushHistory(expression, result) {
    this.history.unshift({ id: nextId('history'), expression, result });
    if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
    return this;
  }

  recallHistory(id) {
    const entry = this.history.find((item) => item.id === id);
    if (!entry) return this;
    this.reset();
    this.value = entry.result;
    this.settledExpression = entry.expression;
    return this;
  }

  clearHistory() {
    this.history = [];
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Modes
   * ---------------------------------------------------------------- */

  setMode(mode) {
    const next = mode === 'scientific' ? 'scientific' : 'standard';
    if (next === this.mode) return this;
    this.mode = next;
    // The pending chain would reference keys the new keypad may not have.
    const value = this.currentValue();
    this.reset();
    this.value = value;
    if (next === 'standard') {
      this.second = false;
      this.hyp = false;
      this.fe = false;
    }
    return this;
  }

  setAngleUnit(unit) {
    if (ANGLE_UNITS.includes(unit)) this.angleUnit = unit;
    return this;
  }

  cycleAngleUnit() {
    const index = ANGLE_UNITS.indexOf(this.angleUnit);
    this.angleUnit = ANGLE_UNITS[(index + 1) % ANGLE_UNITS.length];
    return this;
  }
}

export { ANGLE_UNITS };
