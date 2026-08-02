/**
 * Guards against the shell and the service worker drifting apart. Forgetting a
 * module in the precache list only shows up when the app is opened offline,
 * which is far too late.
 */

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function precachedPaths() {
  const source = await readFile(join(root, 'sw.js'), 'utf8');
  const list = /const SHELL = \[(.*?)\];/s.exec(source);
  assert.ok(list, 'sw.js should declare a SHELL array');
  return [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1].replace(/^\.\//, ''));
}

test('every source module is precached by the service worker', async () => {
  const modules = (await readdir(join(root, 'src'))).filter((name) => name.endsWith('.js'));
  const cached = await precachedPaths();
  const missing = modules.filter((name) => !cached.includes(`src/${name}`));
  assert.deepEqual(missing, [], `add these to SHELL in sw.js: ${missing.join(', ')}`);
});

test('every asset the page links to is precached', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith('http'));
  const cached = await precachedPaths();
  const missing = referenced.filter((path) => !cached.includes(path));
  assert.deepEqual(missing, [], `add these to SHELL in sw.js: ${missing.join(', ')}`);
});

test('the precache list has no stale entries', async () => {
  const cached = await precachedPaths();
  const files = await Promise.all(
    cached
      .filter((path) => path !== '')
      .map(async (path) => {
        try {
          await readFile(join(root, path));
          return null;
        } catch {
          return path;
        }
      }),
  );
  assert.deepEqual(files.filter(Boolean), []);
});
