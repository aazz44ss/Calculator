/**
 * The page is rendered by JavaScript, so what a crawler or a link preview can
 * see comes down to the markup in index.html. These tests keep that honest.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://aazz44ss.github.io/Calculator/';

const html = await readFile(join(root, 'index.html'), 'utf8');

function meta(name) {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)="${name}"[^>]*>`,
    'i',
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;
  return /content="([^"]*)"/i.exec(tag)?.[1] ?? null;
}

function link(rel) {
  const tag = new RegExp(`<link[^>]+rel="${rel}"[^>]*>`, 'i').exec(html)?.[0];
  return tag ? (/href="([^"]*)"/i.exec(tag)?.[1] ?? null) : null;
}

/** Width and height straight out of the PNG header. */
async function pngSize(path) {
  const buffer = await readFile(join(root, path));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('the title says what the page is and fits a result listing', () => {
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  assert.ok(title, 'index.html needs a title');
  assert.match(title, /calculator/i);
  assert.ok(title.length >= 25 && title.length <= 70, `title is ${title.length} characters`);
});

test('the description is present and a sensible length', () => {
  const description = meta('description');
  assert.ok(description, 'index.html needs a meta description');
  assert.ok(
    description.length >= 80 && description.length <= 200,
    `description is ${description.length} characters`,
  );
  assert.match(description, /calculator/i);
});

test('the page declares its language and canonical address', () => {
  assert.match(html, /<html lang="en"/, 'the interface is in English');
  assert.equal(link('canonical'), SITE_URL);
  assert.match(meta('robots') ?? '', /index/);
});

test('link previews have a title, a description and a card image', async () => {
  for (const name of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) {
    assert.ok(meta(name), `missing ${name}`);
  }
  assert.equal(meta('og:url'), SITE_URL);
  assert.equal(meta('twitter:card'), 'summary_large_image');

  const image = meta('og:image');
  assert.ok(image.startsWith(SITE_URL), 'the card image needs an absolute URL');
  const path = image.slice(SITE_URL.length);
  const size = await pngSize(path);
  assert.deepEqual(size, { width: 1200, height: 630 }, 'the card should be 1200x630');
  assert.equal(meta('og:image:width'), String(size.width));
  assert.equal(meta('og:image:height'), String(size.height));
});

test('structured data describes the app', () => {
  const script = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script, 'index.html needs JSON-LD');
  const data = JSON.parse(script);
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.url, SITE_URL);
  assert.equal(data.name, 'Calculator');
  assert.ok(data.description.length > 60);
  assert.ok(Array.isArray(data.featureList) && data.featureList.length >= 4);
});

test('there is exactly one h1, and crawlable text under it', () => {
  const headings = html.match(/<h1[^>]*>/gi) ?? [];
  assert.equal(headings.length, 1, 'a page should have a single h1');

  const summary = /<section class="page-summary">([\s\S]*?)<\/section>/.exec(html)?.[1];
  assert.ok(summary, 'the page needs a text summary for crawlers without JavaScript');
  const text = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.ok(text.length > 200, `the summary is only ${text.length} characters`);
});

test('the manifest matches the page', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'en');
  assert.ok(manifest.description.length > 40);
  assert.equal(manifest.name, 'Calculator');
});

test('the sitemap points at the canonical address', async () => {
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<urlset/);
  assert.ok(sitemap.includes(`<loc>${SITE_URL}</loc>`));
});
