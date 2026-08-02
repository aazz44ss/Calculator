/**
 * Keypad description as plain data.
 *
 * The renderer and the keyboard handler both read from here, so a key can
 * never behave differently depending on how it was pressed.
 *
 * Key shape:
 *   id       stable identifier, also used as the DOM data-key attribute
 *   label    text shown on the key
 *   aria     accessible name
 *   action   engine action, e.g. { type: 'digit', value: '7' }
 *   variant  styling group: digit | function | operator | equals | clear | toggle
 *   span     number of grid rows the key covers (defaults to 1)
 *   alt      replacement while 2nd is active
 *   hyp      replacement while HYP is active
 *   hypAlt   replacement while HYP and 2nd are both active
 *   keys     keyboard bindings, see KEYBOARD_SHORTCUTS
 */

const digit = (value) => ({
  id: `digit-${value}`,
  label: value,
  aria: value,
  action: { type: 'digit', value },
  variant: 'digit',
  keys: [value, `Numpad${value}`],
});

export const MEMORY_KEYS = [
  {
    id: 'memory-clear',
    label: 'MC',
    aria: 'Memory clear',
    action: { type: 'memory-clear' },
    variant: 'memory',
    requiresMemory: true,
  },
  {
    id: 'memory-recall',
    label: 'MR',
    aria: 'Memory recall',
    action: { type: 'memory-recall' },
    variant: 'memory',
    requiresMemory: true,
  },
  {
    id: 'memory-add',
    label: 'M+',
    aria: 'Memory add',
    action: { type: 'memory-add' },
    variant: 'memory',
  },
  {
    id: 'memory-subtract',
    label: 'M−',
    aria: 'Memory subtract',
    action: { type: 'memory-subtract' },
    variant: 'memory',
  },
  {
    id: 'memory-store',
    label: 'MS',
    aria: 'Memory store',
    action: { type: 'memory-store' },
    variant: 'memory',
  },
  {
    id: 'memory-open',
    label: 'M▾',
    aria: 'Open memory list',
    action: { type: 'ui-open-memory' },
    variant: 'memory',
    requiresMemory: true,
  },
];

/** The bit width selector above the programmer keypad. */
export const PROGRAMMER_TOOLBAR_KEYS = [
  {
    id: 'bit-width',
    label: 'QWORD',
    aria: 'Bit width',
    action: { type: 'ui-cycle-bit-width' },
    variant: 'toggle',
  },
];

/** DEG/RAD/GRAD, HYP and F-E live above the scientific keypad, as in Windows. */
export const SCIENTIFIC_TOOLBAR_KEYS = [
  {
    id: 'angle-unit',
    label: 'DEG',
    aria: 'Angle unit',
    action: { type: 'ui-cycle-angle-unit' },
    variant: 'toggle',
  },
  {
    id: 'toggle-hyp',
    label: 'HYP',
    aria: 'Hyperbolic functions',
    action: { type: 'toggle-hyp' },
    variant: 'toggle',
  },
  {
    id: 'toggle-fe',
    label: 'F-E',
    aria: 'Scientific notation',
    action: { type: 'toggle-fe' },
    variant: 'toggle',
  },
];

export const STANDARD_LAYOUT = {
  id: 'standard',
  name: 'Standard',
  columns: 4,
  rows: 6,
  keys: [
    {
      id: 'percent',
      label: '%',
      aria: 'Percent',
      action: { type: 'percent' },
      variant: 'function',
      keys: ['%'],
    },
    {
      id: 'clear-entry',
      label: 'CE',
      aria: 'Clear entry',
      action: { type: 'clear-entry' },
      variant: 'function',
      keys: ['Delete'],
    },
    {
      id: 'clear',
      label: 'C',
      aria: 'Clear all',
      action: { type: 'clear' },
      variant: 'function',
      keys: ['Escape'],
    },
    {
      id: 'backspace',
      label: '⌫',
      aria: 'Backspace',
      action: { type: 'backspace' },
      variant: 'function',
      keys: ['Backspace'],
    },
    {
      id: 'reciprocal',
      label: '1/x',
      aria: 'Reciprocal',
      action: { type: 'unary', value: 'reciprocal' },
      variant: 'function',
      keys: ['r', 'R'],
    },
    {
      id: 'square',
      label: 'x²',
      aria: 'Square',
      action: { type: 'unary', value: 'sqr' },
      variant: 'function',
      keys: ['q', 'Q'],
    },
    {
      id: 'sqrt',
      label: '√x',
      aria: 'Square root',
      action: { type: 'unary', value: 'sqrt' },
      variant: 'function',
      keys: ['@'],
    },
    {
      id: 'divide',
      label: '÷',
      aria: 'Divide',
      action: { type: 'operator', value: 'divide' },
      variant: 'operator',
      keys: ['/', 'NumpadDivide'],
    },
    digit('7'),
    digit('8'),
    digit('9'),
    {
      id: 'multiply',
      label: '×',
      aria: 'Multiply',
      action: { type: 'operator', value: 'multiply' },
      variant: 'operator',
      keys: ['*', 'NumpadMultiply'],
    },
    digit('4'),
    digit('5'),
    digit('6'),
    {
      id: 'subtract',
      label: '−',
      aria: 'Subtract',
      action: { type: 'operator', value: 'subtract' },
      variant: 'operator',
      keys: ['-', 'NumpadSubtract'],
    },
    digit('1'),
    digit('2'),
    digit('3'),
    {
      id: 'add',
      label: '+',
      aria: 'Add',
      action: { type: 'operator', value: 'add' },
      variant: 'operator',
      keys: ['+', 'NumpadAdd'],
    },
    {
      id: 'negate',
      label: '±',
      aria: 'Positive negative',
      action: { type: 'negate' },
      variant: 'digit',
      keys: ['F9'],
    },
    digit('0'),
    {
      id: 'decimal',
      label: '.',
      aria: 'Decimal separator',
      action: { type: 'decimal' },
      variant: 'digit',
      keys: ['.', ',', 'NumpadDecimal'],
    },
    {
      id: 'equals',
      label: '=',
      aria: 'Equals',
      action: { type: 'equals' },
      variant: 'equals',
      keys: ['Enter', '=', 'NumpadEnter'],
    },
  ],
};

export const SCIENTIFIC_LAYOUT = {
  id: 'scientific',
  name: 'Scientific',
  columns: 5,
  rows: 8,
  keys: [
    {
      id: 'toggle-second',
      label: '2ⁿᵈ',
      aria: 'Second function set',
      action: { type: 'toggle-second' },
      variant: 'toggle',
    },
    {
      id: 'constant-pi',
      label: 'π',
      aria: 'Pi',
      action: { type: 'constant', value: 'pi' },
      variant: 'function',
      keys: ['p', 'P'],
    },
    {
      id: 'constant-e',
      label: 'e',
      aria: "Euler's number",
      action: { type: 'constant', value: 'e' },
      variant: 'function',
      keys: ['e', 'E'],
    },
    {
      id: 'clear-entry',
      label: 'CE',
      aria: 'Clear entry',
      action: { type: 'clear-entry' },
      variant: 'function',
      keys: ['Delete'],
    },
    {
      id: 'backspace',
      label: '⌫',
      aria: 'Backspace',
      action: { type: 'backspace' },
      variant: 'function',
      keys: ['Backspace'],
    },

    {
      id: 'sin',
      label: 'sin',
      aria: 'Sine',
      action: { type: 'unary', value: 'sin' },
      variant: 'function',
      keys: ['s', 'S'],
      alt: { label: 'sin⁻¹', aria: 'Inverse sine', action: { type: 'unary', value: 'asin' } },
      hyp: { label: 'sinh', aria: 'Hyperbolic sine', action: { type: 'unary', value: 'sinh' } },
      hypAlt: {
        label: 'sinh⁻¹',
        aria: 'Inverse hyperbolic sine',
        action: { type: 'unary', value: 'asinh' },
      },
    },
    {
      id: 'cos',
      label: 'cos',
      aria: 'Cosine',
      action: { type: 'unary', value: 'cos' },
      variant: 'function',
      keys: ['o', 'O'],
      alt: { label: 'cos⁻¹', aria: 'Inverse cosine', action: { type: 'unary', value: 'acos' } },
      hyp: { label: 'cosh', aria: 'Hyperbolic cosine', action: { type: 'unary', value: 'cosh' } },
      hypAlt: {
        label: 'cosh⁻¹',
        aria: 'Inverse hyperbolic cosine',
        action: { type: 'unary', value: 'acosh' },
      },
    },
    {
      id: 'tan',
      label: 'tan',
      aria: 'Tangent',
      action: { type: 'unary', value: 'tan' },
      variant: 'function',
      keys: ['t', 'T'],
      alt: { label: 'tan⁻¹', aria: 'Inverse tangent', action: { type: 'unary', value: 'atan' } },
      hyp: { label: 'tanh', aria: 'Hyperbolic tangent', action: { type: 'unary', value: 'tanh' } },
      hypAlt: {
        label: 'tanh⁻¹',
        aria: 'Inverse hyperbolic tangent',
        action: { type: 'unary', value: 'atanh' },
      },
    },
    {
      id: 'clear',
      label: 'C',
      aria: 'Clear all',
      action: { type: 'clear' },
      variant: 'function',
      keys: ['Escape'],
    },
    {
      id: 'mod',
      label: 'mod',
      aria: 'Modulo',
      action: { type: 'operator', value: 'mod' },
      variant: 'operator',
      keys: ['m', 'M'],
    },

    {
      id: 'square',
      label: 'x²',
      aria: 'Square',
      action: { type: 'unary', value: 'sqr' },
      variant: 'function',
      keys: ['q', 'Q'],
      alt: { label: 'x³', aria: 'Cube', action: { type: 'unary', value: 'cube' } },
    },
    {
      id: 'reciprocal',
      label: '1/x',
      aria: 'Reciprocal',
      action: { type: 'unary', value: 'reciprocal' },
      variant: 'function',
      keys: ['r', 'R'],
    },
    {
      id: 'abs',
      label: '|x|',
      aria: 'Absolute value',
      action: { type: 'unary', value: 'abs' },
      variant: 'function',
    },
    {
      id: 'exponent',
      label: 'exp',
      aria: 'Exponent',
      action: { type: 'exponent' },
      variant: 'function',
      keys: ['x', 'X'],
    },
    {
      id: 'divide',
      label: '÷',
      aria: 'Divide',
      action: { type: 'operator', value: 'divide' },
      variant: 'operator',
      keys: ['/', 'NumpadDivide'],
    },

    {
      id: 'sqrt',
      label: '√x',
      aria: 'Square root',
      action: { type: 'unary', value: 'sqrt' },
      variant: 'function',
      keys: ['@'],
      alt: { label: '∛x', aria: 'Cube root', action: { type: 'unary', value: 'cbrt' } },
    },
    {
      id: 'paren-open',
      label: '(',
      aria: 'Open parenthesis',
      action: { type: 'paren-open' },
      variant: 'function',
      keys: ['('],
    },
    {
      id: 'paren-close',
      label: ')',
      aria: 'Close parenthesis',
      action: { type: 'paren-close' },
      variant: 'function',
      keys: [')'],
    },
    {
      id: 'factorial',
      label: 'n!',
      aria: 'Factorial',
      action: { type: 'unary', value: 'factorial' },
      variant: 'function',
      keys: ['!'],
    },
    {
      id: 'multiply',
      label: '×',
      aria: 'Multiply',
      action: { type: 'operator', value: 'multiply' },
      variant: 'operator',
      keys: ['*', 'NumpadMultiply'],
    },

    {
      id: 'power',
      label: 'xʸ',
      aria: 'Power',
      action: { type: 'operator', value: 'power' },
      variant: 'function',
      keys: ['y', 'Y', '^'],
      alt: { label: 'ʸ√x', aria: 'Nth root', action: { type: 'operator', value: 'root' } },
    },
    digit('7'),
    digit('8'),
    digit('9'),
    {
      id: 'subtract',
      label: '−',
      aria: 'Subtract',
      action: { type: 'operator', value: 'subtract' },
      variant: 'operator',
      keys: ['-', 'NumpadSubtract'],
    },

    {
      id: 'exp10',
      label: '10ˣ',
      aria: 'Ten to the power of x',
      action: { type: 'unary', value: 'exp10' },
      variant: 'function',
      keys: ['g', 'G'],
      alt: { label: '2ˣ', aria: 'Two to the power of x', action: { type: 'unary', value: 'exp2' } },
    },
    digit('4'),
    digit('5'),
    digit('6'),
    {
      id: 'add',
      label: '+',
      aria: 'Add',
      action: { type: 'operator', value: 'add' },
      variant: 'operator',
      keys: ['+', 'NumpadAdd'],
    },

    {
      id: 'log10',
      label: 'log',
      aria: 'Common logarithm',
      action: { type: 'unary', value: 'log10' },
      variant: 'function',
      keys: ['l', 'L'],
      alt: {
        label: '10ˣ',
        aria: 'Ten to the power of x',
        action: { type: 'unary', value: 'exp10' },
      },
    },
    digit('1'),
    digit('2'),
    digit('3'),
    {
      id: 'equals',
      label: '=',
      aria: 'Equals',
      action: { type: 'equals' },
      variant: 'equals',
      span: 2,
      keys: ['Enter', '=', 'NumpadEnter'],
    },

    {
      id: 'ln',
      label: 'ln',
      aria: 'Natural logarithm',
      action: { type: 'unary', value: 'ln' },
      variant: 'function',
      keys: ['n', 'N'],
      alt: { label: 'eˣ', aria: 'e to the power of x', action: { type: 'unary', value: 'expE' } },
    },
    {
      id: 'negate',
      label: '±',
      aria: 'Positive negative',
      action: { type: 'negate' },
      variant: 'digit',
      keys: ['F9'],
    },
    digit('0'),
    {
      id: 'decimal',
      label: '.',
      aria: 'Decimal separator',
      action: { type: 'decimal' },
      variant: 'digit',
      keys: ['.', ',', 'NumpadDecimal'],
    },
  ],
};

const hexDigit = (value) => ({
  id: `digit-${value}`,
  label: value,
  aria: `Hexadecimal ${value}`,
  action: { type: 'digit', value },
  variant: 'function',
  keys: [value, value.toLowerCase()],
});

/**
 * Programmer keypad. Rows 3 to 8 are the Windows block (A-F down the left,
 * << and >> on the top row); the two rows above hold what Windows keeps behind
 * its Bitwise and Bit Shift dropdowns.
 */
export const PROGRAMMER_LAYOUT = {
  id: 'programmer',
  name: 'Programmer',
  columns: 5,
  rows: 8,
  keys: [
    {
      id: 'and',
      label: 'AND',
      aria: 'Bitwise and',
      action: { type: 'operator', value: 'and' },
      variant: 'operator',
      keys: ['&'],
    },
    {
      id: 'or',
      label: 'OR',
      aria: 'Bitwise or',
      action: { type: 'operator', value: 'or' },
      variant: 'operator',
      keys: ['|'],
    },
    {
      id: 'xor',
      label: 'XOR',
      aria: 'Bitwise exclusive or',
      action: { type: 'operator', value: 'xor' },
      variant: 'operator',
      keys: ['^'],
    },
    {
      id: 'not',
      label: 'NOT',
      aria: 'Bitwise not',
      action: { type: 'unary', value: 'not' },
      variant: 'operator',
      keys: ['~'],
    },
    {
      id: 'nand',
      label: 'NAND',
      aria: 'Bitwise nand',
      action: { type: 'operator', value: 'nand' },
      variant: 'operator',
    },

    {
      id: 'rol',
      label: 'RoL',
      aria: 'Rotate left',
      action: { type: 'operator', value: 'rol' },
      variant: 'operator',
    },
    {
      id: 'ror',
      label: 'RoR',
      aria: 'Rotate right',
      action: { type: 'operator', value: 'ror' },
      variant: 'operator',
    },
    {
      id: 'nor',
      label: 'NOR',
      aria: 'Bitwise nor',
      action: { type: 'operator', value: 'nor' },
      variant: 'operator',
    },
    {
      id: 'mod',
      label: 'mod',
      aria: 'Modulo',
      action: { type: 'operator', value: 'mod' },
      variant: 'operator',
      keys: ['m', 'M'],
    },
    {
      id: 'clear',
      label: 'C',
      aria: 'Clear all',
      action: { type: 'clear' },
      variant: 'function',
      keys: ['Escape'],
    },

    hexDigit('A'),
    {
      id: 'lsh',
      label: '<<',
      aria: 'Shift left',
      action: { type: 'operator', value: 'lsh' },
      variant: 'operator',
      keys: ['<'],
    },
    {
      id: 'rsh',
      label: '>>',
      aria: 'Shift right',
      action: { type: 'operator', value: 'rsh' },
      variant: 'operator',
      keys: ['>'],
    },
    {
      id: 'clear-entry',
      label: 'CE',
      aria: 'Clear entry',
      action: { type: 'clear-entry' },
      variant: 'function',
      keys: ['Delete'],
    },
    {
      id: 'backspace',
      label: '⌫',
      aria: 'Backspace',
      action: { type: 'backspace' },
      variant: 'function',
      keys: ['Backspace'],
    },

    hexDigit('B'),
    {
      id: 'paren-open',
      label: '(',
      aria: 'Open parenthesis',
      action: { type: 'paren-open' },
      variant: 'function',
      keys: ['('],
    },
    {
      id: 'paren-close',
      label: ')',
      aria: 'Close parenthesis',
      action: { type: 'paren-close' },
      variant: 'function',
      keys: [')'],
    },
    {
      id: 'percent',
      label: '%',
      aria: 'Percent',
      action: { type: 'percent' },
      variant: 'function',
      keys: ['%'],
    },
    {
      id: 'divide',
      label: '÷',
      aria: 'Divide',
      action: { type: 'operator', value: 'divide' },
      variant: 'operator',
      keys: ['/', 'NumpadDivide'],
    },

    hexDigit('C'),
    digit('7'),
    digit('8'),
    digit('9'),
    {
      id: 'multiply',
      label: '×',
      aria: 'Multiply',
      action: { type: 'operator', value: 'multiply' },
      variant: 'operator',
      keys: ['*', 'NumpadMultiply'],
    },

    hexDigit('D'),
    digit('4'),
    digit('5'),
    digit('6'),
    {
      id: 'subtract',
      label: '−',
      aria: 'Subtract',
      action: { type: 'operator', value: 'subtract' },
      variant: 'operator',
      keys: ['-', 'NumpadSubtract'],
    },

    hexDigit('E'),
    digit('1'),
    digit('2'),
    digit('3'),
    {
      id: 'add',
      label: '+',
      aria: 'Add',
      action: { type: 'operator', value: 'add' },
      variant: 'operator',
      keys: ['+', 'NumpadAdd'],
    },

    hexDigit('F'),
    {
      id: 'negate',
      label: '±',
      aria: 'Positive negative',
      action: { type: 'negate' },
      variant: 'digit',
      keys: ['F9'],
    },
    digit('0'),
    {
      id: 'decimal',
      label: '.',
      aria: 'Decimal separator',
      action: { type: 'decimal' },
      variant: 'digit',
      keys: ['.', ',', 'NumpadDecimal'],
    },
    {
      id: 'equals',
      label: '=',
      aria: 'Equals',
      action: { type: 'equals' },
      variant: 'equals',
      keys: ['Enter', '=', 'NumpadEnter'],
    },
  ],
};

export const LAYOUTS = {
  standard: STANDARD_LAYOUT,
  scientific: SCIENTIFIC_LAYOUT,
  programmer: PROGRAMMER_LAYOUT,
};

export const TOOLBAR_KEYS = {
  standard: [],
  scientific: SCIENTIFIC_TOOLBAR_KEYS,
  programmer: PROGRAMMER_TOOLBAR_KEYS,
};

/** Resolve the effective face of a key for the current 2nd/HYP state. */
export function resolveKey(key, state = {}) {
  const { second = false, hyp = false } = state;
  let face = key;
  if (hyp && second && key.hypAlt) face = key.hypAlt;
  else if (hyp && key.hyp) face = key.hyp;
  else if (second && key.alt) face = key.alt;
  return {
    id: key.id,
    label: face.label ?? key.label,
    aria: face.aria ?? key.aria ?? face.label ?? key.label,
    action: face.action ?? key.action,
    variant: key.variant,
    span: key.span ?? 1,
    requiresMemory: Boolean(key.requiresMemory),
  };
}

/**
 * Keyboard bindings that are not tied to a keypad key.
 * `key` is matched case-insensitively for single characters, modifiers must
 * match exactly, and `modes` limits a binding to certain keypads — that is how
 * F3-F5 can mean angle units in scientific mode and bit widths or bases in
 * programmer mode, the same overlap Windows has.
 */
export const KEYBOARD_SHORTCUTS = [
  { key: 'm', ctrl: true, action: { type: 'memory-store' } },
  { key: 'p', ctrl: true, action: { type: 'memory-add' } },
  { key: 'q', ctrl: true, action: { type: 'memory-subtract' } },
  { key: 'r', ctrl: true, action: { type: 'memory-recall' } },
  { key: 'l', ctrl: true, action: { type: 'memory-clear' } },
  { key: 'h', action: { type: 'ui-toggle-history' } },
  { key: 'h', ctrl: true, action: { type: 'ui-toggle-history' } },
  { key: '1', alt: true, action: { type: 'mode', value: 'standard' } },
  { key: '2', alt: true, action: { type: 'mode', value: 'scientific' } },
  { key: '3', alt: true, action: { type: 'mode', value: 'programmer' } },

  { key: 'F3', modes: ['scientific'], action: { type: 'angle-unit', value: 'deg' } },
  { key: 'F4', modes: ['scientific'], action: { type: 'angle-unit', value: 'rad' } },
  { key: 'F5', modes: ['scientific'], action: { type: 'angle-unit', value: 'grad' } },
  { key: 'v', modes: ['scientific'], action: { type: 'toggle-fe' } },
  { key: 'i', modes: ['scientific'], action: { type: 'toggle-second' } },

  { key: 'F5', modes: ['programmer'], action: { type: 'number-base', value: 'hex' } },
  { key: 'F6', modes: ['programmer'], action: { type: 'number-base', value: 'dec' } },
  { key: 'F7', modes: ['programmer'], action: { type: 'number-base', value: 'oct' } },
  { key: 'F8', modes: ['programmer'], action: { type: 'number-base', value: 'bin' } },
  { key: 'F2', modes: ['programmer'], action: { type: 'bit-width', value: 'byte' } },
  { key: 'F3', modes: ['programmer'], action: { type: 'bit-width', value: 'word' } },
  { key: 'F4', modes: ['programmer'], action: { type: 'bit-width', value: 'dword' } },
  { key: 'F12', modes: ['programmer'], action: { type: 'bit-width', value: 'qword' } },
];

/**
 * Look up the action for a keyboard event.
 *
 * @param {{ key: string, code?: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, shiftKey?: boolean }} event
 * @param {string} mode
 */
export function findActionForKeyboardEvent(event, mode = 'standard') {
  const layout = LAYOUTS[mode] ?? STANDARD_LAYOUT;
  const ctrl = Boolean(event.ctrlKey || event.metaKey);
  const alt = Boolean(event.altKey);

  for (const shortcut of KEYBOARD_SHORTCUTS) {
    const matchesKey = shortcut.key.length === 1
      ? shortcut.key.toLowerCase() === String(event.key).toLowerCase()
      : shortcut.key === event.key;
    if (!matchesKey) continue;
    if (Boolean(shortcut.ctrl) !== ctrl) continue;
    if (Boolean(shortcut.alt) !== alt) continue;
    if (shortcut.modes && !shortcut.modes.includes(mode)) continue;
    return { action: shortcut.action, keyId: null };
  }

  if (ctrl || alt) return null;

  for (const key of layout.keys) {
    if (!key.keys) continue;
    for (const binding of key.keys) {
      if (binding === event.key || binding === event.code) {
        return { action: key.action, keyId: key.id };
      }
    }
  }
  return null;
}
