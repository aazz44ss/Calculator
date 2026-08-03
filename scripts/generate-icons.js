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

/** 1200×630 card used by og:image and twitter:image. */
function socialCard() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${BACKGROUND_START}"/>
    <stop offset="1" stop-color="${BACKGROUND_END}"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(80 123) scale(0.75)">${glyph()}</g>
  <g fill="${KEY_FILL}" font-family="Segoe UI, DejaVu Sans, Helvetica, Arial, sans-serif">
    <text x="520" y="285" font-size="88" font-weight="700">Calculator</text>
    <text x="520" y="345" font-size="34" opacity="0.88">Standard · Scientific · Programmer</text>
    <text x="520" y="400" font-size="28" opacity="0.72">Exact decimals, live history, works offline</text>
  </g>
</svg>
`;
}

/**
 * iOS shows a blank screen while a home screen web app boots unless it finds a
 * startup image whose media query matches the device exactly. These are the
 * iPhone sizes worth covering, as CSS pixels and device pixel ratio.
 */
const IPHONE_SCREENS = [
  { width: 375, height: 667, ratio: 2 }, // SE 2nd/3rd, 6/7/8
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 16 Plus
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
];

const SPLASH_THEMES = [
  { id: 'light', background: '#f3f3f3', scheme: 'light' },
  { id: 'dark', background: '#202020', scheme: 'dark' },
];

/** Launch screen: the app background with the icon where it sits in the app. */
function splash(width, height, background) {
  const size = Math.round(Math.min(width, height) * 0.3);
  const x = Math.round((width - size) / 2);
  const y = Math.round(height / 2 - size * 0.85);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <g transform="translate(${x} ${y}) scale(${(size / 512).toFixed(4)})">
    <rect width="512" height="512" rx="96" fill="${FLAT_BACKGROUND}"/>
    ${glyph()}
  </g>
</svg>
`;
}

async function writeSplashScreens(sharp) {
  const dir = join(iconsDir, 'splash');
  await mkdir(dir, { recursive: true });
  const links = [];

  for (const screen of IPHONE_SCREENS) {
    for (const theme of SPLASH_THEMES) {
      const width = screen.width * screen.ratio;
      const height = screen.height * screen.ratio;
      const file = `splash/${width}x${height}-${theme.id}.png`;
      await sharp(Buffer.from(splash(width, height, theme.background)))
        .png({ compressionLevel: 9, palette: true })
        .toFile(join(iconsDir, file));
      links.push(
        `<link rel="apple-touch-startup-image" media="(prefers-color-scheme: ${theme.scheme}) and ` +
          `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and ` +
          `(-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)" ` +
          `href="icons/${file}" />`,
      );
    }
  }

  console.log(`wrote ${links.length} launch screens to ${dir}`);
  return links;
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

  const cardPath = join(iconsDir, 'social-card.png');
  await sharp(Buffer.from(socialCard())).png({ compressionLevel: 9 }).toFile(cardPath);
  console.log(`wrote ${cardPath} (1200×630)`);

  for (const target of TARGETS) {
    let pipeline = sharp(Buffer.from(target.svg)).resize(target.size, target.size);
    if (target.flattenTo) pipeline = pipeline.flatten({ background: target.flattenTo });
    const output = join(iconsDir, target.file);
    await pipeline.png({ compressionLevel: 9 }).toFile(output);
    console.log(`wrote ${output} (${target.size}×${target.size})`);
  }

  const links = await writeSplashScreens(sharp);
  if (process.argv.includes('--print-links')) console.log(`\n${links.join('\n')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
