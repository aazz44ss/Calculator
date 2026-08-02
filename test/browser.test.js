/**
 * End-to-end tests.
 *
 * The WebKit suite is the important one: it is the engine iOS Safari uses, and
 * this app is meant to live on an iPhone home screen. The offline reload runs
 * in Chromium instead, because Playwright's WebKit throws an internal error
 * when a page is reloaded after setOffline(true); WebKit still checks that the
 * service worker cached the complete shell.
 */

import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

import { chromium, webkit } from 'playwright';

import { startServer } from '../scripts/serve.js';

const TIMEOUT = 90_000;
const WIDTHS = [320, 375, 414, 768, 1024, 1280];
const SHELL_PATHS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/styles/app.css',
  '/src/app.js',
  '/src/decimal.js',
  '/src/engine.js',
  '/src/format.js',
  '/src/layout.js',
  '/src/programmer.js',
  '/icons/favicon.svg',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];

let server;
let baseUrl;

before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://localhost:${server.port}`;
});

after(async () => {
  await server?.close();
});

async function openApp(browser, options = {}) {
  const { width = 390, height = 844, context: existingContext } = options;
  const context = existingContext ?? (await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/`);
  await page.waitForSelector('[data-key="digit-7"]');
  return { context, page, errors };
}

/** Runs `body` against a fresh app and fails if anything hit the console. */
async function withApp(browser, options, body) {
  const { context, page, errors } = await openApp(browser, options);
  try {
    await body(page, context);
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  } finally {
    await context.close();
  }
}

const keySelector = (id) => `[data-key="${id}"]`;

async function tap(page, ...ids) {
  for (const id of ids) await page.tap(keySelector(id));
}

async function tapDigits(page, text) {
  for (const character of text) {
    await tap(page, character === '.' ? 'decimal' : `digit-${character}`);
  }
}

const readDisplay = (page) => page.textContent('#display');
const readExpression = (page) => page.textContent('#expression');

/** Modes live behind the title bar menu, there is no tab strip. */
async function switchMode(page, mode) {
  await page.tap('#mode-menu-button');
  await page.tap(`[data-mode-button="${mode}"]`);
}

const elements = (page, selector) => page.locator(selector).count();

/** The panel fades its visibility, so give the transition a chance to finish. */
async function waitForVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
}

async function waitForServiceWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
    timeout: 30_000,
  });
}

async function cachedPaths(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const paths = new Set();
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        paths.add(new URL(request.url).pathname);
      }
    }
    return [...paths];
  });
}

describe('webkit', () => {
  let browser;

  before(async () => {
    browser = await webkit.launch();
  });

  after(async () => {
    await browser?.close();
  });

  for (const width of WIDTHS) {
    test(`lays out without horizontal overflow at ${width}px`, { timeout: TIMEOUT }, async () => {
      await withApp(browser, { width, height: 844 }, async (page) => {
        const metrics = await page.evaluate(() => ({
          documentScroll: document.documentElement.scrollWidth,
          documentClient: document.documentElement.clientWidth,
          bodyScroll: document.body.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        assert.ok(
          metrics.documentScroll <= metrics.documentClient,
          `document scrolls horizontally: ${metrics.documentScroll} > ${metrics.documentClient}`,
        );
        assert.ok(
          metrics.bodyScroll <= metrics.innerWidth,
          `body is wider than the viewport: ${metrics.bodyScroll} > ${metrics.innerWidth}`,
        );

        const outside = await page.evaluate(() =>
          [...document.querySelectorAll('.key, .chip, .mode-tab')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              if (rect.width === 0) return false;
              return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
            })
            .map((element) => element.dataset.key ?? element.textContent),
        );
        assert.deepEqual(outside, [], 'controls stick out of the viewport');
      });
    });
  }

  test('keys keep their aspect ratio on tall screens', { timeout: TIMEOUT }, async () => {
    for (const [width, height] of [
      [390, 844],
      [320, 900],
      [414, 896],
    ]) {
      await withApp(browser, { width, height }, async (page) => {
        const box = await page.locator(keySelector('digit-5')).boundingBox();
        const ratio = box.height / box.width;
        assert.ok(
          ratio > 0.75 && ratio < 1.2,
          `key at ${width}x${height} is ${box.width}x${box.height} (ratio ${ratio.toFixed(2)})`,
        );

        const keypad = await page.locator('#keypad').boundingBox();
        assert.ok(
          keypad.y + keypad.height <= height + 1,
          `keypad runs past the bottom of the ${height}px viewport`,
        );
      });
    }
  });

  test('the install hint stays in the flow and never covers a key', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 390, height: 844 }, async (page) => {
      const hint = page.locator('#install-hint');
      assert.ok(await hint.isVisible(), 'the install hint should be visible in a browser tab');

      const position = await page.evaluate(
        () => getComputedStyle(document.getElementById('install-hint')).position,
      );
      assert.equal(position, 'static', 'a floating hint would sit on top of the keypad');

      const overlapping = await page.evaluate(() => {
        const hintRect = document.getElementById('install-hint').getBoundingClientRect();
        return [...document.querySelectorAll('.key')]
          .filter((key) => {
            const rect = key.getBoundingClientRect();
            return !(
              rect.right <= hintRect.left ||
              rect.left >= hintRect.right ||
              rect.bottom <= hintRect.top ||
              rect.top >= hintRect.bottom
            );
          })
          .map((key) => key.dataset.key);
      });
      assert.deepEqual(overlapping, [], 'the install hint overlaps keys');

      // The equals key must still be the top-most element under its own centre.
      const hitTest = await page.evaluate(() => {
        const rect = document.querySelector('[data-key="equals"]').getBoundingClientRect();
        const element = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return element?.dataset?.key ?? element?.tagName;
      });
      assert.equal(hitTest, 'equals');

      await tapDigits(page, '7');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), '7');

      // Having finished a calculation, the hint steps aside for the tape.
      assert.equal(await hint.isVisible(), false);
      await page.reload();
      await page.waitForSelector('[data-key="digit-7"]');
      assert.equal(await page.locator('#install-hint').isVisible(), false);
    });
  });

  test('touch input adds up', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      await tapDigits(page, '7');
      await tap(page, 'multiply');
      await tapDigits(page, '8');
      assert.equal(await readExpression(page), '7 ×');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), '56');
      assert.equal(await readExpression(page), '7 × 8 =');
    });
  });

  test('decimal arithmetic is exact through the keypad', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      await tapDigits(page, '0.1');
      await tap(page, 'add');
      await tapDigits(page, '0.2');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), '0.3');

      await tap(page, 'clear');
      await tapDigits(page, '0.07');
      await tap(page, 'multiply');
      await tapDigits(page, '100');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), '7');
    });
  });

  test('keyboard input works and the finished expression stays visible', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      await page.keyboard.type('12*12');
      await page.keyboard.press('Enter');
      assert.equal(await readDisplay(page), '144');
      assert.equal(await readExpression(page), '12 × 12 =');

      // Still showing the settled expression until a new calculation starts.
      await page.waitForTimeout(50);
      assert.equal(await readExpression(page), '12 × 12 =');

      await page.keyboard.type('5');
      assert.equal(await readDisplay(page), '5');
      assert.equal(await readExpression(page), '');
    });
  });

  test('the Windows keyboard shortcuts are wired up', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      await page.keyboard.type('9');
      await page.keyboard.press('q'); // x²
      assert.equal(await readDisplay(page), '81');
      await page.keyboard.press('@'); // √
      assert.equal(await readDisplay(page), '9');
      await page.keyboard.press('r'); // 1/x
      assert.equal(await readDisplay(page), '0.1111111111111111');
      await page.keyboard.press('F9'); // ±
      assert.equal(await readDisplay(page), '-0.1111111111111111');

      await page.keyboard.press('Escape'); // C
      assert.equal(await readDisplay(page), '0');

      await page.keyboard.type('5+3');
      await page.keyboard.press('Delete'); // CE
      await page.keyboard.type('4');
      await page.keyboard.press('Enter');
      assert.equal(await readDisplay(page), '9');

      await page.keyboard.press('h'); // history panel
      assert.equal(await page.locator('#side-panel').getAttribute('data-open'), 'true');
      assert.equal(await page.locator('#panel-history .panel-item').count(), 1);
      await page.keyboard.press('h');
      assert.equal(await page.locator('#side-panel').getAttribute('data-open'), 'false');
    });
  });

  test('scientific mode swaps in the 5x8 keypad with brackets and 2nd', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 414, height: 896 }, async (page) => {
      await switchMode(page, 'scientific');
      const keypad = page.locator('#keypad');
      assert.equal(await keypad.getAttribute('data-columns'), '5');
      assert.equal(await keypad.getAttribute('data-rows'), '8');
      assert.equal(await page.locator(keySelector('sin')).textContent(), 'sin');
      assert.equal(await page.locator('#mode-title').textContent(), 'Scientific');

      await tapDigits(page, '2');
      await tap(page, 'multiply', 'paren-open');
      assert.equal(await page.locator('#paren-badge').textContent(), '( 1');
      await tapDigits(page, '3');
      await tap(page, 'add');
      await tapDigits(page, '4');
      await tap(page, 'paren-close', 'equals');
      assert.equal(await readDisplay(page), '14');
      assert.equal(await readExpression(page), '2 × (3 + 4) =');

      await tap(page, 'toggle-second');
      assert.equal(await page.locator(keySelector('sin')).textContent(), 'sin⁻¹');
      assert.equal(await page.locator(keySelector('square')).textContent(), 'x³');
      await tap(page, 'toggle-second');
      assert.equal(await page.locator(keySelector('sin')).textContent(), 'sin');

      assert.equal(await page.locator(keySelector('angle-unit')).textContent(), 'DEG');
      await tap(page, 'angle-unit');
      assert.equal(await page.locator(keySelector('angle-unit')).textContent(), 'RAD');
      await tap(page, 'angle-unit');
      assert.equal(await page.locator(keySelector('angle-unit')).textContent(), 'GRAD');
    });
  });

  test('scientific-only keys do nothing in standard mode', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      assert.equal(await page.locator('#keypad').getAttribute('data-columns'), '4');
      assert.equal(await page.locator(keySelector('sin')).count(), 0);
      assert.equal(await page.locator(keySelector('paren-open')).count(), 0);
      assert.equal(await page.locator('#toolbar').isVisible(), false);

      await page.keyboard.type('5');
      for (const key of ['s', 'o', 't', 'n', 'l', 'g', '(', ')', 'v', 'i', 'x', 'p', 'e', 'y']) {
        await page.keyboard.press(key);
      }
      await page.keyboard.press('F4'); // RAD
      assert.equal(await readDisplay(page), '5');
      assert.equal(await readExpression(page), '');
      assert.equal(await page.locator('#paren-badge').isVisible(), false);

      // The same keys come alive on the scientific keypad.
      await switchMode(page, 'scientific');
      await page.keyboard.type('5');
      await page.keyboard.press('s');
      assert.equal(await readExpression(page), 'sin(5)');
    });
  });

  test('programmer mode shows every base and works on bits', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 414, height: 896 }, async (page) => {
      await switchMode(page, 'programmer');
      const keypad = page.locator('#keypad');
      assert.equal(await keypad.getAttribute('data-columns'), '5');
      assert.equal(await keypad.getAttribute('data-rows'), '8');

      await tapDigits(page, '255');
      const bases = await page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('.base-row')].map((row) => [
            row.dataset.base,
            row.lastChild.textContent,
          ]),
        ),
      );
      assert.deepEqual(bases, { hex: 'FF', dec: '255', oct: '377', bin: '1111 1111' });

      // A-F only light up once the active base is hexadecimal.
      assert.equal(await page.locator(keySelector('digit-A')).isDisabled(), true);
      assert.equal(await page.locator(keySelector('decimal')).isDisabled(), true);
      await page.tap('[data-base="hex"]');
      assert.equal(await readDisplay(page), 'FF');
      assert.equal(await page.locator(keySelector('digit-A')).isDisabled(), false);
      assert.equal(
        await page.locator('[data-base="hex"]').getAttribute('aria-pressed'),
        'true',
      );

      await tap(page, 'and');
      await tap(page, 'digit-F');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), 'F');
      assert.equal(await readExpression(page), 'FF AND F =');

      // NOT works on all 64 bits.
      await tap(page, 'clear');
      await tap(page, 'digit-0', 'not');
      assert.equal(await readDisplay(page), 'FFFF FFFF FFFF FFFF');
      assert.match(await page.textContent('[data-base="dec"]'), /-1/);

      // The tape is here too, next to the four bases.
      const tapeEntry = page.locator('.tape-button').first();
      assert.equal(await page.locator('#tape').isVisible(), true);
      assert.match(await tapeEntry.textContent(), /FF AND F =F/);

      // Keyboard: F8 selects BIN.
      await page.keyboard.press('F8');
      assert.equal(await readDisplay(page), `${'1111 '.repeat(15)}1111`);
      assert.equal(
        await page.locator('[data-base="bin"]').getAttribute('aria-pressed'),
        'true',
      );
    });
  });

  test('degree trigonometry lands exactly on the axes', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 414, height: 896 }, async (page) => {
      await switchMode(page, 'scientific');

      await tapDigits(page, '180');
      await tap(page, 'sin');
      assert.equal(await readDisplay(page), '0');

      await tap(page, 'clear');
      await tapDigits(page, '180');
      await tap(page, 'cos');
      assert.equal(await readDisplay(page), '-1');

      await tap(page, 'clear');
      await tapDigits(page, '90');
      await tap(page, 'tan');
      assert.equal(await readDisplay(page), 'Invalid input');

      await tap(page, 'clear-entry');
      await tapDigits(page, '2');
      await tap(page, 'add');
      await tapDigits(page, '3');
      await tap(page, 'equals');
      assert.equal(await readDisplay(page), '5');
    });
  });

  test('the title bar menu switches modes and the tape lists recent work', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 390, height: 844 }, async (page) => {
      // The old tab strip is gone; modes live behind the hamburger.
      assert.equal(await page.locator('.mode-tab').count(), 0);
      const menu = page.locator('#mode-menu');
      assert.equal(await menu.isVisible(), false);

      await page.tap('#mode-menu-button');
      await waitForVisible(menu);
      assert.equal(await elements(page, '#mode-menu [data-mode-button]'), 3);
      assert.equal(
        await page.locator('[data-mode-button="standard"]').getAttribute('aria-checked'),
        'true',
      );

      await page.tap('[data-mode-button="programmer"]');
      assert.equal(await menu.isVisible(), false, 'picking a mode closes the menu');
      assert.equal(await page.locator('#mode-title').textContent(), 'Programmer');
      assert.equal(await page.locator('#keypad').getAttribute('data-rows'), '8');

      // Escape closes the menu instead of clearing the calculation.
      await switchMode(page, 'standard');
      await page.keyboard.type('42');
      await page.tap('#mode-menu-button');
      await waitForVisible(menu);
      await page.keyboard.press('Escape');
      assert.equal(await menu.isVisible(), false);
      assert.equal(await readDisplay(page), '42');

      // The tape keeps finished calculations in view, newest at the bottom.
      await page.keyboard.press('Escape');
      for (const sum of ['12*12', '0.1+0.2', '99-45']) {
        await page.keyboard.type(sum);
        await page.keyboard.press('Enter');
      }
      const entries = await page.locator('.tape-button').allTextContents();
      assert.equal(entries.length, 3);
      assert.match(entries[0], /99 − 45 =54/);
      assert.match(entries[2], /12 × 12 =144/);

      const tapeBox = await page.locator('#tape').boundingBox();
      const displayBox = await page.locator('#display-area').boundingBox();
      const keypadBox = await page.locator('#keypad').boundingBox();
      assert.ok(tapeBox.y + tapeBox.height <= displayBox.y + 1, 'the tape sits above the display');
      assert.ok(displayBox.y + displayBox.height <= keypadBox.y + 1);
      assert.ok(tapeBox.height > 60, `the tape should have room, got ${tapeBox.height}px`);

      // Tapping an entry brings its result back.
      await page.tap('.tape-button >> nth=2');
      assert.equal(await readDisplay(page), '144');
      assert.equal(await readExpression(page), '12 × 12 =');

      // A taller keypad may leave the tape no room; it must then hide itself
      // instead of leaving entries that are clipped out of sight but tappable.
      for (const mode of ['scientific', 'programmer', 'standard']) {
        await switchMode(page, mode);
        const reachable = await page.evaluate(() => {
          const tape = document.getElementById('tape');
          if (tape.classList.contains('is-collapsed')) return 'hidden';
          const button = document.querySelector('.tape-button');
          if (!button) return 'empty';
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return button.contains(hit) ? 'reachable' : 'blocked';
        });
        assert.equal(reachable, 'reachable', `the tape is not usable in ${mode} mode`);

        // Each keypad brings its own extras back, however you got there.
        const toolbar = await page.evaluate(() =>
          [...document.getElementById('toolbar').querySelectorAll('[data-key]')].map(
            (button) => button.dataset.key,
          ),
        );
        const expected = mode === 'scientific' ? ['angle-unit', 'toggle-hyp', 'toggle-fe'] : [];
        assert.deepEqual(toolbar, expected, `wrong toolbar in ${mode} mode`);
        assert.equal(
          await page.locator('#base-list').isVisible(),
          mode === 'programmer',
          `wrong base list visibility in ${mode} mode`,
        );
      }
    });
  });

  test('the tape stays visible in a short browser viewport', { timeout: TIMEOUT }, async () => {
    // Safari keeps a URL bar, so the page is far shorter than the screen. The
    // keypad has to give the tape room instead of squeezing it out of sight.
    for (const [width, height] of [
      [390, 734],
      [390, 664],
      [375, 635],
    ]) {
      await withApp(browser, { width, height }, async (page) => {
        await page.keyboard.type('6*7');
        await page.keyboard.press('Enter');

        const tape = page.locator('#tape');
        assert.equal(await tape.isVisible(), true, `tape hidden at ${width}x${height}`);
        const box = await tape.boundingBox();
        assert.ok(box.height >= 40, `tape is only ${box.height}px at ${width}x${height}`);

        const entry = page.locator('.tape-button').first();
        assert.match(await entry.textContent(), /6 × 7 =42/);
        await entry.tap();
        assert.equal(await readDisplay(page), '42');

        // The keys give up height for it but must stay comfortably tappable.
        const key = await page.locator(keySelector('digit-5')).boundingBox();
        assert.ok(key.height >= 44, `keys shrank to ${key.height}px at ${width}x${height}`);
      });
    }
  });

  test('history is a drawer on phones and a rail on wide screens', { timeout: TIMEOUT }, async () => {
    await withApp(browser, { width: 390, height: 844 }, async (page) => {
      const panel = page.locator('#side-panel');
      assert.equal(await panel.isVisible(), false, 'the drawer starts closed on phones');

      await page.keyboard.type('6*7');
      await page.keyboard.press('Enter');
      await page.tap('#history-button');
      assert.equal(await panel.getAttribute('data-open'), 'true');
      await waitForVisible(panel);
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.getElementById('side-panel')).position),
        'fixed',
      );

      const entry = page.locator('#panel-history .panel-item').first();
      assert.match(await entry.textContent(), /6 × 7 =/);
      assert.match(await entry.textContent(), /42/);

      await page.tap('#panel-history .panel-item button');
      assert.equal(await readDisplay(page), '42');
      assert.equal(await panel.getAttribute('data-open'), 'false', 'recalling closes the drawer');
    });

    await withApp(browser, { width: 1024, height: 800 }, async (page) => {
      const panel = page.locator('#side-panel');
      assert.equal(await panel.isVisible(), true, 'the rail is always visible on wide screens');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.getElementById('side-panel')).position),
        'static',
      );
      assert.equal(await page.locator('#panel-close').isVisible(), false);
      assert.equal(await page.locator('#panel-empty').isVisible(), true);

      await page.keyboard.type('8-3');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#panel-history .panel-item').count(), 1);
      assert.equal(await page.locator('#panel-empty').isVisible(), false);
    });
  });

  test('mode, theme and history survive a reload', { timeout: TIMEOUT }, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await withApp(browser, { context }, async (page) => {
        await switchMode(page, 'scientific');
        await page.tap('#theme-button'); // system -> light
        await page.tap('#theme-button'); // light -> dark
        await page.keyboard.type('11*11');
        await page.keyboard.press('Enter');
        assert.equal(await readDisplay(page), '121');

        await page.reload();
        await page.waitForSelector('[data-key="digit-7"]');

        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        assert.equal(await page.locator('html').getAttribute('data-mode'), 'scientific');
        assert.equal(await page.locator('#keypad').getAttribute('data-rows'), '8');
        assert.equal(await readDisplay(page), '0', 'a reload starts a fresh calculation');
        assert.match(await page.locator('.tape-button').first().textContent(), /11 × 11 =121/);

        await page.tap('#history-button');
        assert.match(await page.locator('#panel-history .panel-item').first().textContent(), /11 × 11 =/);
      });
    } finally {
      await context.close();
    }
  });

  test('the manifest and the iOS meta tags describe an installable app', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
      assert.equal(manifestHref, 'manifest.webmanifest');
      const manifestUrl = new URL(manifestHref, page.url()).href;
      const response = await page.request.get(manifestUrl);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /application\/manifest\+json/);

      const manifest = await response.json();
      assert.equal(manifest.name, 'Calculator');
      assert.equal(manifest.display, 'standalone');
      assert.equal(manifest.start_url, './');
      assert.equal(manifest.scope, './');
      const iconSizes = manifest.icons.map((icon) => icon.sizes);
      assert.ok(iconSizes.includes('192x192'));
      assert.ok(iconSizes.includes('512x512'));
      assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));

      const meta = await page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('meta[name]')].map((tag) => [tag.name, tag.content]),
        ),
      );
      assert.equal(meta['apple-mobile-web-app-capable'], 'yes');
      assert.equal(meta['apple-mobile-web-app-title'], 'Calculator');
      assert.equal(meta['apple-mobile-web-app-status-bar-style'], 'black-translucent');
      assert.match(meta.viewport, /viewport-fit=cover/);
      assert.equal(
        await page.evaluate(() => document.querySelectorAll('meta[name="theme-color"]').length),
        2,
      );

      // Safari prefers this link over the manifest icons, so it has to resolve.
      const appleIcon = page.locator('link[rel="apple-touch-icon"]');
      assert.equal(await appleIcon.getAttribute('sizes'), '180x180');
      const iconHref = await appleIcon.getAttribute('href');
      const iconResponse = await page.request.get(new URL(iconHref, page.url()).href);
      assert.equal(iconResponse.status(), 200);
      assert.equal(iconResponse.headers()['content-type'], 'image/png');

      const dimensions = await page.evaluate(
        (source) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => reject(new Error('icon failed to load'));
            image.src = source;
          }),
        iconHref,
      );
      assert.deepEqual(dimensions, { width: 180, height: 180 });
    });
  });

  test('the service worker precaches the whole shell', { timeout: TIMEOUT }, async () => {
    await withApp(browser, {}, async (page) => {
      await waitForServiceWorker(page);
      const paths = await cachedPaths(page);
      const missing = SHELL_PATHS.filter((path) => !paths.includes(path));
      assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
    });
  });
});

describe('chromium', () => {
  let browser;

  before(async () => {
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
  });

  test('keeps working after going offline and reloading', { timeout: TIMEOUT }, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await withApp(browser, { context }, async (page, activeContext) => {
        await waitForServiceWorker(page);

        await activeContext.setOffline(true);
        await page.reload();
        await page.waitForSelector('[data-key="digit-7"]');

        await tapDigits(page, '9');
        await tap(page, 'multiply');
        await tapDigits(page, '9');
        await tap(page, 'equals');
        assert.equal(await readDisplay(page), '81');
        assert.equal(await readExpression(page), '9 × 9 =');

        // The reload happened with the network blocked, so the shell can only
        // have come from the service worker cache.
        assert.equal(
          await page.evaluate(() => navigator.serviceWorker.controller !== null),
          true,
        );
        assert.ok((await cachedPaths(page)).includes('/index.html'));
      });
    } finally {
      await context.close();
    }
  });
});
