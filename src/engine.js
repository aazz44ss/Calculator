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
import {
  DEFAULT_BASE,
  MASK,
  NUMBER_BASES,
  ProgrammerError,
  computeInteger,
  formatInteger,
  isDigitInBase,
  notInteger,
  parseDigits,
  wrapSigned,
} from './programmer.js';

const MAX_ENTRY_DIGITS = 16;
const MAX_RESULT_DIGITS = 10000;
const HISTORY_LIMIT = 50;

export const ERRORS = {
  DIVIDE_BY_ZERO: 'Cannot divide by zero',
  INVALID_INPUT: 'Invalid input',
  OVERFLOW: 'Overflow',
};

export const MODES = ['standard', 'scientific', 'programmer'];

/** Which action types each keypad understands. */
const TYPES_BY_MODE = {
  standard: new Set([
    'digit',
    'decimal',
    'operator',
    'unary',
    'negate',
    'percent',
    'equals',
    'clear',
    'clear-entry',
    'backspace',
  ]),
  scientific: new Set([
    'digit',
    'decimal',
    'exponent',
    'operator',
    'unary',
    'negate',
    'percent',
    'equals',
    'clear',
    'clear-entry',
    'backspace',
    'paren-open',
    'paren-close',
    'constant',
    'toggle-second',
    'toggle-hyp',
    'toggle-fe',
    'angle-unit',
  ]),
  programmer: new Set([
    'digit',
    'operator',
    'unary',
    'negate',
    'percent',
    'equals',
    'clear',
    'clear-entry',
    'backspace',
    'paren-open',
    'paren-close',
    'number-base',
  ]),
};

/** Which binary operators each keypad offers. */
const OPERATORS_BY_MODE = {
  standard: new Set(['add', 'subtract', 'multiply', 'divide']),
  scientific: new Set(['add', 'subtract', 'multiply', 'divide', 'power', 'root', 'mod']),
  programmer: new Set([
    'add',
    'subtract',
    'multiply',
    'divide',
    'mod',
    'and',
    'or',
    'xor',
    'nand',
    'nor',
    'lsh',
    'rsh',
    'rol',
    'ror',
  ]),
};

const STANDARD_UNARY_FUNCTIONS = new Set(['sqr', 'sqrt', 'reciprocal']);
const PROGRAMMER_UNARY_FUNCTIONS = new Set(['not']);

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
  'number-base',
  'history-clear',
]);

const UNARY_TOKENS = {
  not: (operand) => `NOT(${operand})`,
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
  // `not` is handled by the programmer path, listed here so the key resolves.
  not: (value) => value,
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
    this.mode = MODES.includes(options.mode) ? options.mode : 'standard';
    this.angleUnit = ANGLE_UNITS.includes(options.angleUnit) ? options.angleUnit : 'deg';
    this.base = NUMBER_BASES.some((item) => item.id === options.base) ? options.base : DEFAULT_BASE;
    this.second = Boolean(options.second);
    this.hyp = Boolean(options.hyp);
    this.fe = Boolean(options.fe);
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

  get isProgrammer() {
    return this.mode === 'programmer';
  }

  /** The current value as a BigInt, only meaningful in programmer mode. */
  toBigInt(value = this.currentValue()) {
    return wrapSigned(BigInt(value.truncateTo(0).toString()));
  }

  fromBigInt(value) {
    return Decimal.fromString(wrapSigned(value).toString());
  }

  /** Render a value the way the current mode displays numbers. */
  format(value) {
    if (this.isProgrammer) {
      return formatInteger(BigInt(value.truncateTo(0).toString()), this.base);
    }
    return formatValue(value, { fe: this.fe });
  }

  currentValue() {
    if (this.entry === null) return this.value;
    if (this.isProgrammer) return this.fromBigInt(parseDigits(this.entry, this.base));
    return entryToDecimal(this.entry);
  }

  currentOperandToken() {
    if (this.operandExpression !== null) return this.operandExpression;
    if (this.isProgrammer) return this.format(this.currentValue());
    if (this.entry !== null) return formatEntry(this.entry);
    return formatValue(this.value, { fe: this.fe });
  }

  displayText() {
    if (this.error) return this.error;
    const preview = this.previewValue();
    if (preview !== null) return this.format(preview);
    if (this.isProgrammer) return this.format(this.currentValue());
    if (this.entry !== null) return formatEntry(this.entry);
    return formatValue(this.value, { fe: this.fe });
  }

  expressionText() {
    if (this.settledExpression !== null) return this.settledExpression;
    const parts = [];
    for (const frame of this.parenStack) parts.push(...frame.tokens, '(');
    parts.push(...this.tokens);
    // While a chain is running the big display shows the live result, so the
    // number being typed belongs here instead.
    if (this.operandExpression !== null || (parts.length > 0 && this.entry !== null)) {
      parts.push(this.currentOperandToken());
    }
    return formatExpression(parts);
  }

  /** The expression including the operand on screen, used to report errors. */
  pendingExpressionText() {
    const parts = [];
    for (const frame of this.parenStack) parts.push(...frame.tokens, '(');
    parts.push(...this.tokens, this.currentOperandToken());
    return formatExpression(parts);
  }

  get parenDepth() {
    return this.parenStack.length;
  }

  getState() {
    const value = this.currentValue();
    return {
      display: this.displayText(),
      expression: this.expressionText(),
      isError: Boolean(this.error),
      mode: this.mode,
      angleUnit: this.angleUnit,
      base: this.base,
      bases: NUMBER_BASES.map((item) => ({
        id: item.id,
        label: item.label,
        active: item.id === this.base,
        text: this.error
          ? '0'
          : formatInteger(BigInt(value.truncateTo(0).toString()), item.id),
      })),
      second: this.second,
      hyp: this.hyp,
      fe: this.fe,
      parenDepth: this.parenDepth,
      history: this.history.map((item) => ({
        id: item.id,
        expression: item.expression,
        result: this.format(item.result),
      })),
    };
  }

  toJSON() {
    return {
      mode: this.mode,
      angleUnit: this.angleUnit,
      base: this.base,
      second: this.second,
      hyp: this.hyp,
      fe: this.fe,
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
      case 'number-base':
        this.setBase(String(value));
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
    if (this.error && !ERROR_SAFE_TYPES.has(action.type)) return false;
    return this.isActionAvailable(action);
  }

  /**
   * Whether the current keypad offers this action at all, ignoring any error
   * state. The renderer uses it to grey keys out, for example A-F while the
   * active base is decimal.
   */
  isActionAvailable(action) {
    const { type, value } = action;
    const types = TYPES_BY_MODE[this.mode];
    if (!types) return true;

    // History and mode switching work everywhere.
    if (!types.has(type)) {
      return type.startsWith('history-') || type === 'mode' || type.startsWith('ui-');
    }

    if (type === 'operator') return OPERATORS_BY_MODE[this.mode].has(String(value));
    if (type === 'unary') {
      if (this.mode === 'programmer') return PROGRAMMER_UNARY_FUNCTIONS.has(String(value));
      if (this.mode === 'standard') return STANDARD_UNARY_FUNCTIONS.has(String(value));
      return !PROGRAMMER_UNARY_FUNCTIONS.has(String(value));
    }
    if (type === 'digit' && this.isProgrammer) return isDigitInBase(value, this.base);
    if (type === 'digit') return /^[0-9]$/.test(String(value));
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
    if (this.isProgrammer) {
      this.inputProgrammerDigit(String(digit).toUpperCase());
      return;
    }
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

  inputProgrammerDigit(digit) {
    if (!isDigitInBase(digit, this.base)) return;
    this.startNewCalculationIfSettled();
    this.operandExpression = null;

    const next = this.entry === null || this.entry === '0' ? digit : this.entry + digit;
    // Refuse a keystroke that would not fit the selected bit width.
    if (parseDigits(next, this.base) > MASK) return;
    this.entry = next;
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
    if (this.isProgrammer) {
      const negated = this.fromBigInt(-this.toBigInt());
      this.entry = null;
      this.value = negated;
      this.operandExpression = null;
      this.settledExpression = null;
      this.hasFreshOperand = true;
      return;
    }
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
    if (this.isProgrammer) {
      try {
        return this.fromBigInt(
          computeInteger(this.toBigInt(left), operator, this.toBigInt(right)),
        );
      } catch (error) {
        if (error instanceof ProgrammerError) throw new DecimalError(error.message);
        throw error;
      }
    }
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
    // Captured up front: the failing operand is still on screen here, and it is
    // what the user needs to see next to the error message.
    const attempted = this.pendingExpressionText();
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
        this.settledExpression = attempted;
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
        // Keep the first operand on screen; it used to blank to zero here.
        this.value = value;
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
      const result = this.isProgrammer
        ? this.fromBigInt(notInteger(this.toBigInt(value)))
        : this.guardResult(fn(value, this.angleUnit));
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
      const share = relative && this.accumulator
        ? this.accumulator.multiply(value).divide(Decimal.HUNDRED)
        : value.divide(Decimal.HUNDRED);
      const result = this.isProgrammer ? this.fromBigInt(this.toBigInt(share)) : share;
      this.value = result;
      this.entry = null;
      this.operandExpression = this.format(result);
      this.settledExpression = null;
      this.hasFreshOperand = true;
    });
  }

  /**
   * What pressing "=" would produce, worked out without touching any state:
   * brackets folded from the inside out, then the pending operator, or else a
   * repeat of the previous operation.
   */
  foldToResult() {
    let accumulator = this.accumulator;
    let operator = this.pendingOperator;
    let tokens = [...this.tokens];
    let value = this.currentValue();
    let token = this.currentOperandToken();

    for (let index = this.parenStack.length - 1; index >= 0; index -= 1) {
      const inner = [...tokens, token];
      if (operator) value = this.guardResult(this.compute(accumulator, operator, value));
      token = `(${formatExpression(inner)})`;
      const frame = this.parenStack[index];
      accumulator = frame.accumulator;
      operator = frame.pendingOperator;
      tokens = [...frame.tokens];
    }

    if (operator) {
      return {
        result: this.guardResult(this.compute(accumulator, operator, value)),
        parts: [...tokens, token, '='],
        operation: { operator, operand: value },
      };
    }
    if (this.lastOperation) {
      const { operator: repeated, operand } = this.lastOperation;
      return {
        result: this.guardResult(this.compute(value, repeated, operand)),
        parts: [token, OPERATOR_SYMBOLS[repeated], this.format(operand), '='],
        operation: this.lastOperation,
      };
    }
    return { result: value, parts: [token, '='], operation: null };
  }

  /**
   * The running result shown while typing. Null when there is nothing to
   * preview yet, so the display falls back to the digits being entered.
   */
  previewValue() {
    if (this.error || this.settledExpression !== null || !this.hasFreshOperand) return null;
    const pending =
      this.pendingOperator !== null || this.parenStack.some((frame) => frame.pendingOperator);
    if (!pending) return null;
    try {
      return this.foldToResult().result;
    } catch (error) {
      // A half typed expression may not compute yet; keep quiet until "=".
      if (error instanceof DecimalError) return null;
      throw error;
    }
  }

  equals() {
    this.runGuarded(() => {
      const { result, parts, operation } = this.foldToResult();

      this.value = result;
      this.entry = null;
      this.operandExpression = null;
      this.accumulator = null;
      this.pendingOperator = null;
      this.hasFreshOperand = false;
      this.tokens = [];
      this.parenStack = [];
      if (operation) this.lastOperation = operation;
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
    // History, mode and the toggles survive "C", exactly like Windows.
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
    const next = MODES.includes(mode) ? mode : 'standard';
    if (next === this.mode) return this;
    // The pending chain would reference keys the new keypad may not have.
    const value = this.currentValue();
    this.mode = next;
    this.reset();
    this.value = next === 'programmer' ? this.fromBigInt(this.toBigInt(value)) : value;
    if (next !== 'scientific') {
      this.second = false;
      this.hyp = false;
      this.fe = false;
    }
    return this;
  }

  setBase(base) {
    const target = NUMBER_BASES.find((item) => item.id === base);
    if (!target) return this;
    // A number being typed stays editable, it is just re-spelled in the new base.
    if (this.entry !== null) {
      const digits = parseDigits(this.entry, this.base);
      this.entry = digits.toString(Number(target.radix)).toUpperCase();
    }
    this.base = base;
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
