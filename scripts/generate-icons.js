#!/usr/bin/env node
/**
 * Draw the app icon and rasterise the PWA / iOS variants.
 *
 * Run with `npm run icons`. Writes icons/favicon.svg (the source drawing) plus
 * apple-touch-icon.png, icon-192.png, icon-512.png and icon-512-maskable.png.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', 'icons');

const BACKGROUND_START = '#0a5cb8';
const BACKGROUND_END = '#2f8ddc';
const FLAT_BACKGROUND = '#0f6cbd';
const KEY_FILL = '#ffffff';
const ACCENT_FILL = '#9ee7ff';

/** Calculator glyph drawn inside a 512×512 box. */
function glyph() {
  const keys = [];
  const columns = 3;
  const rows = 3;
  const left = 136;
  const top = 208;
  const width = 72;
  const height = 56;
  const gap = 12;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = left + column * (width + gap);
      const y = top + row * (height + gap);
      const isEquals = row === rows - 1 && column === columns - 1;
      keys.push(
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${
          isEquals ? ACCENT_FILL : KEY_FILL
        }" opacity="${isEquals ? 1 : 0.92}"/>`,
      );
    }
  }

  return [
    `<rect x="136" y="112" width="240" height="72" rx="14" fill="${KEY_FILL}" opacity="0.28"/>`,
    `<rect x="152" y="132" width="120" height="16" rx="8" fill="${KEY_FILL}" opacity="0.9"/>`,
    `<rect x="152" y="158" width="72" height="12" rx="6" fill="${KEY_FILL}" opacity="0.6"/>`,
    ...keys,
  ].join('');
}

/**
 * @param {{ rounded?: boolean, gradient?: boolean, glyphScale?: number }} options
 */
function artwork(options = {}) {
  const { rounded = true, gradient = true, glyphScale = 1 } = options;
  const offset = (512 - 512 * glyphScale) / 2;
  const background = gradient
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BACKGROUND_START}"/>
        <stop offset="1" stop-color="${BACKGROUND_END}"/>
      </linearGradient></defs>
      <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="url(#bg)"/>`
    : `<rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="${FLAT_BACKGROUND}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Calculator">
  ${background}
  <g transform="translate(${offset} ${offset}) scale(${glyphScale})">${glyph()}</g>
</svg>
`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, svg: artwork(), flattenTo: null },
  { file: 'icon-512.png', size: 512, svg: artwork(), flattenTo: null },
  {
    // Safari ignores rounded corners and transparency, so bake both in.
    file: 'apple-touch-icon.png',
    size: 180,
    svg: artwork({ rounded: false }),
    flattenTo: FLAT_BACKGROUND,
  },
  {
    // Maskable icons get cropped to a circle, keep the glyph in the safe zone.
    file: 'icon-512-maskable.png',
    size: 512,
    svg: artwork({ rounded: false, gradient: false, glyphScale: 0.62 }),
    flattenTo: FLAT_BACKGROUND,
  },
];

async function main() {
  const { default: sharp } = await import('sharp').catch(() => ({ default: null }));
  await mkdir(iconsDir, { recursive: true });

  const faviconPath = join(iconsDir, 'favicon.svg');
  await writeFile(faviconPath, artwork(), 'utf8');
  console.log(`wrote ${faviconPath}`);

  if (!sharp) {
    console.error('sharp is not installed. Run `npm install` first to generate the PNG icons.');
    process.exitCode = 1;
    return;
  }

  for (const target of TARGETS) {
    let pipeline = sharp(Buffer.from(target.svg)).resize(target.size, target.size);
    if (target.flattenTo) pipeline = pipeline.flatten({ background: target.flattenTo });
    const output = join(iconsDir, target.file);
    await pipeline.png({ compressionLevel: 9 }).toFile(output);
    console.log(`wrote ${output} (${target.size}×${target.size})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
