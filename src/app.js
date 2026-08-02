/**
 * The only module that touches the DOM.
 *
 * It renders the keypad from the layout data, forwards both pointer and
 * keyboard input into the engine, and persists mode/theme/history/memory.
 */

import { CalculatorEngine } from './engine.js';
import {
  LAYOUTS,
  MEMORY_KEYS,
  TOOLBAR_KEYS,
  findActionForKeyboardEvent,
  resolveKey,
} from './layout.js';
import { BIT_WIDTHS } from './programmer.js';

const STORAGE_KEYS = {
  state: 'calculator:state',
  theme: 'calculator:theme',
  panel: 'calculator:panel',
  installHint: 'calculator:install-hint',
};

const THEMES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };
const ANGLE_LABELS = { deg: 'DEG', rad: 'RAD', grad: 'GRAD' };

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage disabled, run in memory only */
    }
  },
};

const elements = {
  root: document.documentElement,
  calculator: document.getElementById('calculator'),
  modeTitle: document.getElementById('mode-title'),
  modeMenuButton: document.getElementById('mode-menu-button'),
  modeMenu: document.getElementById('mode-menu'),
  tape: document.getElementById('tape'),
  displayArea: document.getElementById('display-area'),
  expression: document.getElementById('expression'),
  display: document.getElementById('display'),
  parenBadge: document.getElementById('paren-badge'),
  memoryBadge: document.getElementById('memory-badge'),
  toolbar: document.getElementById('toolbar'),
  baseList: document.getElementById('base-list'),
  memoryRow: document.getElementById('memory-row'),
  keypad: document.getElementById('keypad'),
  themeButton: document.getElementById('theme-button'),
  themeIcon: document.getElementById('theme-icon'),
  historyButton: document.getElementById('history-button'),
  sidePanel: document.getElementById('side-panel'),
  panelBackdrop: document.getElementById('panel-backdrop'),
  panelClose: document.getElementById('panel-close'),
  panelClear: document.getElementById('panel-clear'),
  panelHistory: document.getElementById('panel-history'),
  panelMemory: document.getElementById('panel-memory'),
  panelEmpty: document.getElementById('panel-empty'),
  installHint: document.getElementById('install-hint'),
  installHintText: document.getElementById('install-hint-text'),
  installHintDismiss: document.getElementById('install-hint-dismiss'),
};

function readStoredState() {
  const raw = storage.get(STORAGE_KEYS.state);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const engine = CalculatorEngine.restore(readStoredState());

const ui = {
  theme: THEMES.includes(storage.get(STORAGE_KEYS.theme)) ? storage.get(STORAGE_KEYS.theme) : 'system',
  panelTab: storage.get(STORAGE_KEYS.panel) === 'memory' ? 'memory' : 'history',
  panelOpen: false,
  modeMenuOpen: false,
  keypadSignature: '',
  panelSignature: '',
  tapeSignature: '',
};

const keyRegistry = new Map();

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function currentLayout() {
  return LAYOUTS[engine.mode] ?? LAYOUTS.standard;
}

function currentToolbarKeys() {
  return TOOLBAR_KEYS[engine.mode] ?? [];
}

function buildRegistry() {
  keyRegistry.clear();
  for (const key of currentLayout().keys) keyRegistry.set(key.id, key);
  for (const key of MEMORY_KEYS) keyRegistry.set(key.id, key);
  for (const key of currentToolbarKeys()) keyRegistry.set(key.id, key);
}

function renderKeypad() {
  const layout = currentLayout();
  const signature = `${layout.id}:${engine.second}:${engine.hyp}`;
  if (signature === ui.keypadSignature) {
    updateToggleStates();
    return;
  }
  ui.keypadSignature = signature;

  elements.keypad.style.setProperty('--columns', String(layout.columns));
  elements.keypad.style.setProperty('--rows', String(layout.rows));
  elements.keypad.dataset.mode = layout.id;
  elements.keypad.dataset.columns = String(layout.columns);
  elements.keypad.dataset.rows = String(layout.rows);

  const fragment = document.createDocumentFragment();
  for (const key of layout.keys) {
    const face = resolveKey(key, engine);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'key';
    button.dataset.key = key.id;
    button.dataset.variant = face.variant;
    button.setAttribute('aria-label', face.aria);
    button.textContent = face.label;
    if (face.span > 1) button.style.gridRow = `span ${face.span}`;
    if (key.id === 'toggle-second') button.setAttribute('aria-pressed', String(engine.second));
    fragment.append(button);
  }
  elements.keypad.replaceChildren(fragment);
  updateKeyAvailability();
}

/** Grey out keys the current mode and base do not accept, such as A-F in DEC. */
function updateKeyAvailability() {
  for (const button of elements.keypad.querySelectorAll('[data-key]')) {
    const key = keyRegistry.get(button.dataset.key);
    if (!key) continue;
    button.disabled = !engine.isActionAvailable(resolveKey(key, engine).action);
  }
}

function renderToolbar() {
  const keys = currentToolbarKeys();
  if (keys.length === 0) {
    elements.toolbar.hidden = true;
    elements.toolbar.replaceChildren();
    return;
  }

  elements.toolbar.hidden = false;
  if (elements.toolbar.dataset.mode !== engine.mode) {
    elements.toolbar.dataset.mode = engine.mode;
    const fragment = document.createDocumentFragment();
    for (const key of keys) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.dataset.key = key.id;
      button.textContent = key.label;
      button.setAttribute('aria-label', key.aria);
      fragment.append(button);
    }
    elements.toolbar.replaceChildren(fragment);
  }

  for (const button of elements.toolbar.querySelectorAll('[data-key]')) {
    if (button.dataset.key === 'angle-unit') {
      button.textContent = ANGLE_LABELS[engine.angleUnit];
      button.title = `Angle unit: ${ANGLE_LABELS[engine.angleUnit]}`;
      continue;
    }
    if (button.dataset.key === 'bit-width') {
      const width = BIT_WIDTHS.find((item) => item.id === engine.bitWidth);
      button.textContent = width.label;
      button.title = `Bit width: ${width.label} (${width.bits} bits)`;
      continue;
    }
    const pressed = button.dataset.key === 'toggle-hyp' ? engine.hyp : engine.fe;
    button.setAttribute('aria-pressed', String(pressed));
  }
}

function renderBases(state) {
  if (state.mode !== 'programmer') {
    elements.baseList.hidden = true;
    elements.baseList.replaceChildren();
    return;
  }

  elements.baseList.hidden = false;
  if (elements.baseList.childElementCount !== state.bases.length) {
    const fragment = document.createDocumentFragment();
    for (const base of state.bases) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'base-row';
      button.dataset.base = base.id;
      button.setAttribute('aria-label', `Show ${base.label}`);
      const label = document.createElement('span');
      label.className = 'base-label';
      const value = document.createElement('span');
      value.className = 'base-value';
      button.append(label, value);
      item.append(button);
      fragment.append(item);
    }
    elements.baseList.replaceChildren(fragment);
  }

  const buttons = elements.baseList.querySelectorAll('.base-row');
  state.bases.forEach((base, index) => {
    const button = buttons[index];
    button.dataset.base = base.id;
    button.setAttribute('aria-pressed', String(base.active));
    button.firstChild.textContent = base.label;
    button.lastChild.textContent = base.text;
  });
}

function renderMemoryRow(state) {
  if (elements.memoryRow.childElementCount === 0) {
    const fragment = document.createDocumentFragment();
    for (const key of MEMORY_KEYS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.dataset.key = key.id;
      button.textContent = key.label;
      button.setAttribute('aria-label', key.aria);
      fragment.append(button);
    }
    elements.memoryRow.replaceChildren(fragment);
  }

  for (const button of elements.memoryRow.querySelectorAll('[data-key]')) {
    const key = MEMORY_KEYS.find((candidate) => candidate.id === button.dataset.key);
    button.disabled = Boolean(key?.requiresMemory) && !state.hasMemory;
  }
}

function displaySizeFor(text) {
  const length = text.length;
  if (length <= 9) return 'clamp(2rem, 10vw, 3rem)';
  if (length <= 13) return 'clamp(1.6rem, 7.6vw, 2.4rem)';
  if (length <= 18) return 'clamp(1.3rem, 6vw, 1.9rem)';
  return 'clamp(1rem, 4.4vw, 1.5rem)';
}

function renderDisplay(state) {
  elements.expression.textContent = state.expression;
  elements.display.textContent = state.display;
  elements.displayArea.classList.toggle('is-error', state.isError);
  elements.displayArea.style.setProperty('--display-size', displaySizeFor(state.display));

  if (state.parenDepth > 0) {
    elements.parenBadge.hidden = false;
    elements.parenBadge.textContent = `( ${state.parenDepth}`;
  } else {
    elements.parenBadge.hidden = true;
  }
  elements.memoryBadge.hidden = !state.hasMemory;
}

function panelSignature(state) {
  return JSON.stringify([
    ui.panelTab,
    state.history.map((entry) => [entry.id, entry.expression, entry.result]),
    state.memory.map((entry) => entry.text),
  ]);
}

function renderPanel(state) {
  // Rebuilding the lists on every key press would throw away their scroll
  // position while the panel is open.
  const signature = panelSignature(state);
  if (signature === ui.panelSignature) return;
  ui.panelSignature = signature;

  const isHistory = ui.panelTab === 'history';
  for (const tab of elements.sidePanel.querySelectorAll('[data-panel-tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.panelTab === ui.panelTab));
  }
  elements.panelHistory.hidden = !isHistory;
  elements.panelMemory.hidden = isHistory;

  const historyItems = state.history.map((entry) => {
    const item = document.createElement('li');
    item.className = 'panel-item';
    item.dataset.historyId = entry.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-item-button';
    button.dataset.panelAction = 'history-recall';
    button.dataset.id = entry.id;
    const expression = document.createElement('span');
    expression.className = 'panel-item-expression';
    expression.textContent = entry.expression;
    const result = document.createElement('span');
    result.className = 'panel-item-result';
    result.textContent = entry.result;
    button.append(expression, result);
    item.append(button);
    return item;
  });
  elements.panelHistory.replaceChildren(...historyItems);

  const memoryItems = state.memory.map((entry) => {
    const item = document.createElement('li');
    item.className = 'panel-item';
    item.dataset.memoryIndex = String(entry.index);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-item-button panel-item-result';
    button.dataset.panelAction = 'memory-recall';
    button.dataset.index = String(entry.index);
    button.textContent = entry.text;
    const actions = document.createElement('div');
    actions.className = 'panel-item-actions';
    for (const [label, action, aria] of [
      ['MC', 'memory-clear', 'Clear this memory'],
      ['M+', 'memory-add', 'Add to this memory'],
      ['M−', 'memory-subtract', 'Subtract from this memory'],
    ]) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'chip';
      actionButton.dataset.panelAction = action;
      actionButton.dataset.index = String(entry.index);
      actionButton.textContent = label;
      actionButton.setAttribute('aria-label', aria);
      actions.append(actionButton);
    }
    item.append(button, actions);
    return item;
  });
  elements.panelMemory.replaceChildren(...memoryItems);

  const isEmpty = isHistory ? state.history.length === 0 : state.memory.length === 0;
  elements.panelEmpty.hidden = !isEmpty;
  elements.panelEmpty.textContent = isHistory
    ? "There's no history yet."
    : "There's nothing saved in memory.";
}

function updateToggleStates() {
  const secondKey = elements.keypad.querySelector('[data-key="toggle-second"]');
  if (secondKey) secondKey.setAttribute('aria-pressed', String(engine.second));
}

function renderMode() {
  const layout = currentLayout();
  elements.root.dataset.mode = layout.id;
  elements.modeTitle.textContent = layout.name;
  for (const item of elements.modeMenu.querySelectorAll('[data-mode-button]')) {
    item.setAttribute('aria-checked', String(item.dataset.modeButton === layout.id));
  }
}

function setModeMenuOpen(open) {
  ui.modeMenuOpen = open;
  elements.modeMenu.hidden = !open;
  elements.modeMenuButton.setAttribute('aria-expanded', String(open));
}

/** The at-a-glance list of finished calculations above the display. */
function renderTape(state) {
  const signature = state.history.map((entry) => entry.id).join('|');
  if (signature === ui.tapeSignature) return;
  ui.tapeSignature = signature;

  const items = state.history.map((entry) => {
    const item = document.createElement('li');
    item.className = 'tape-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tape-button';
    button.dataset.panelAction = 'history-recall';
    button.dataset.id = entry.id;
    button.setAttribute('aria-label', `${entry.expression} ${entry.result}`);
    button.append(document.createTextNode(entry.expression));
    const result = document.createElement('span');
    result.className = 'tape-result';
    result.textContent = entry.result;
    button.append(result);
    item.append(button);
    return item;
  });
  elements.tape.replaceChildren(...items);
}

function renderTheme() {
  elements.root.dataset.theme = ui.theme;
  elements.themeIcon.textContent = THEME_ICONS[ui.theme];
  elements.themeButton.setAttribute('aria-label', `Theme: ${ui.theme}`);
}

function renderPanelVisibility() {
  elements.sidePanel.dataset.open = String(ui.panelOpen);
  elements.panelBackdrop.hidden = !ui.panelOpen;
  elements.historyButton.setAttribute('aria-expanded', String(ui.panelOpen));
}

function render() {
  const state = engine.getState();
  buildRegistry();
  renderMode();
  renderKeypad();
  updateKeyAvailability();
  renderToolbar();
  renderBases(state);
  renderMemoryRow(state);
  renderTape(state);
  renderDisplay(state);
  renderPanel(state);
  renderPanelVisibility();
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function persist() {
  storage.set(STORAGE_KEYS.state, JSON.stringify(engine.toJSON()));
  storage.set(STORAGE_KEYS.theme, ui.theme);
  storage.set(STORAGE_KEYS.panel, ui.panelTab);
}

function setPanelOpen(open, tab) {
  if (tab) ui.panelTab = tab;
  ui.panelOpen = open;
  persist();
  render();
}

function dispatch(action) {
  if (!action) return;
  switch (action.type) {
    case 'ui-toggle-history':
      setPanelOpen(!ui.panelOpen, 'history');
      return;
    case 'ui-open-memory':
      setPanelOpen(true, 'memory');
      return;
    case 'ui-cycle-angle-unit':
      if (engine.mode === 'scientific') engine.cycleAngleUnit();
      break;
    case 'ui-cycle-bit-width':
      if (engine.mode === 'programmer') engine.cycleBitWidth();
      break;
    default:
      engine.press(action);
      break;
  }
  persist();
  render();
}

function flashKey(keyId) {
  if (!keyId) return;
  const button = elements.keypad.querySelector(`[data-key="${keyId}"]`);
  if (!button) return;
  button.classList.add('is-pressed');
  window.setTimeout(() => button.classList.remove('is-pressed'), 110);
}

function handleKeyElement(element) {
  const key = keyRegistry.get(element.dataset.key);
  if (!key) return;
  const face = resolveKey(key, engine);
  dispatch(face.action);
}

function handlePanelAction(element) {
  const action = element.dataset.panelAction;
  const index = element.dataset.index === undefined ? undefined : Number(element.dataset.index);
  switch (action) {
    case 'history-recall':
      dispatch({ type: 'history-recall', value: element.dataset.id });
      setPanelOpen(window.innerWidth >= 720, ui.panelTab);
      break;
    case 'memory-recall':
      dispatch({ type: 'memory-recall', value: index });
      break;
    case 'memory-add':
      dispatch({ type: 'memory-add', value: index });
      break;
    case 'memory-subtract':
      dispatch({ type: 'memory-subtract', value: index });
      break;
    case 'memory-clear':
      dispatch({ type: 'memory-clear', value: index });
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

// Pointer clicks (detail > 0) should not leave a focus ring behind, and they
// should not leave a button focused where Enter would then re-trigger it.
document.addEventListener(
  'click',
  (event) => {
    if (event.detail === 0 || !(event.target instanceof Element)) return;
    event.target.closest('button')?.blur();
  },
  true,
);

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (ui.modeMenuOpen && !target.closest('#mode-menu') && !target.closest('#mode-menu-button')) {
    setModeMenuOpen(false);
  }

  const keyElement = target.closest('[data-key]');
  if (keyElement instanceof HTMLElement) {
    handleKeyElement(keyElement);
    return;
  }

  const panelElement = target.closest('[data-panel-action]');
  if (panelElement instanceof HTMLElement) {
    handlePanelAction(panelElement);
    return;
  }

  const baseButton = target.closest('[data-base]');
  if (baseButton instanceof HTMLElement) {
    dispatch({ type: 'number-base', value: baseButton.dataset.base });
    return;
  }

  const modeButton = target.closest('[data-mode-button]');
  if (modeButton instanceof HTMLElement) {
    setModeMenuOpen(false);
    dispatch({ type: 'mode', value: modeButton.dataset.modeButton });
    return;
  }

  const panelTab = target.closest('[data-panel-tab]');
  if (panelTab instanceof HTMLElement) {
    setPanelOpen(true, panelTab.dataset.panelTab);
  }
});

elements.themeButton.addEventListener('click', () => {
  const index = THEMES.indexOf(ui.theme);
  ui.theme = THEMES[(index + 1) % THEMES.length];
  renderTheme();
  persist();
});

elements.historyButton.addEventListener('click', () => {
  setPanelOpen(!ui.panelOpen, ui.panelTab);
});

elements.panelClose.addEventListener('click', () => setPanelOpen(false));
elements.panelBackdrop.addEventListener('click', () => setPanelOpen(false));

elements.panelClear.addEventListener('click', () => {
  if (ui.panelTab === 'history') dispatch({ type: 'history-clear' });
  else dispatch({ type: 'memory-clear' });
});

elements.modeMenuButton.addEventListener('click', () => {
  setModeMenuOpen(!ui.modeMenuOpen);
});

elements.installHintDismiss.addEventListener('click', () => {
  elements.installHint.hidden = true;
  storage.set(STORAGE_KEYS.installHint, 'dismissed');
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.isContentEditable) return;

  if (event.key === 'Escape' && ui.modeMenuOpen) {
    event.preventDefault();
    const insideMenu = elements.modeMenu.contains(document.activeElement);
    setModeMenuOpen(false);
    // Only pull focus back for someone who tabbed into the menu; doing it
    // after a tap would leave the hamburger focused and swallow the next Enter.
    if (insideMenu) elements.modeMenuButton.focus();
    return;
  }

  // Let a focused control handle its own activation keys.
  const active = document.activeElement;
  const activatesFocus = event.key === 'Enter' || event.key === ' ';
  if (activatesFocus && active instanceof HTMLElement && active.tagName === 'BUTTON') return;

  const match = findActionForKeyboardEvent(event, engine.mode);
  if (!match) return;
  event.preventDefault();
  flashKey(match.keyId);
  dispatch(match.action);
});

/* ------------------------------------------------------------------ *
 * Install hint and service worker
 * ------------------------------------------------------------------ */

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

function setupInstallHint() {
  if (storage.get(STORAGE_KEYS.installHint) === 'dismissed' || isStandalone()) {
    elements.installHint.hidden = true;
    return;
  }
  elements.installHintText.textContent = isIos()
    ? 'Add to Home Screen from the Share menu.'
    : 'Install from your browser menu.';
  elements.installHint.hidden = false;
}

function registerServiceWorker() {
  if (!('serviceWorker' in window.navigator)) return;
  if (!window.isSecureContext) {
    // Plain http:// over a LAN address is not a secure origin, see README.
    console.info('Service worker skipped: this origin is not secure.');
    return;
  }
  const url = new URL('../sw.js', import.meta.url);
  window.navigator.serviceWorker.register(url).catch(() => {
    console.info('Service worker registration failed.');
  });
}

renderTheme();
render();
setupInstallHint();
registerServiceWorker();

export { engine, ui };
