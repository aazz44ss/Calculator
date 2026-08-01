#!/usr/bin/env node
/**
 * Zero-dependency static server for development and for the browser tests.
 *
 * `npm start` prints the local and LAN URLs plus a QR code, and reminds you
 * that a plain http:// LAN address is not a secure origin, so the service
 * worker (and therefore offline mode and "Add to Home Screen") only works on
 * localhost or behind https.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_PORT = 4173;

const MIME_TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  }),
);

function contentTypeFor(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

async function resolveFile(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  try {
    const stats = await stat(candidate);
    if (stats.isDirectory()) {
      const indexFile = join(candidate, 'index.html');
      const indexStats = await stat(indexFile);
      return indexStats.isFile() ? indexFile : null;
    }
    return stats.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ root?: string, port?: number, host?: string }} [options]
 * @returns {Promise<{ port: number, host: string, url: string, close: () => Promise<void> }>}
 */
export function startServer(options = {}) {
  const root = resolve(options.root ?? PROJECT_ROOT);
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? '127.0.0.1';

  const server = createServer(async (request, response) => {
    const filePath = await resolveFile(root, request.url ?? '/');
    if (!filePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentTypeFor(filePath),
      'cache-control': 'no-store',
      'service-worker-allowed': '/',
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolvePromise({
        port: actualPort,
        host,
        url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

function lanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const details of interfaces ?? []) {
      if (details.family === 'IPv4' && !details.internal) addresses.push(details.address);
    }
  }
  return addresses;
}

async function printQrCode(url) {
  try {
    const { default: qrcode } = await import('qrcode-terminal');
    await new Promise((done) => {
      qrcode.generate(url, { small: true }, (code) => {
        console.log(code);
        done();
      });
    });
  } catch {
    console.log('(install the dev dependencies to print a QR code here)');
  }
}

async function main() {
  const portArgument = process.argv.find((argument) => argument.startsWith('--port='));
  const port = portArgument ? Number(portArgument.split('=')[1]) : DEFAULT_PORT;
  const server = await startServer({ port, host: '0.0.0.0' });

  const [lan] = lanAddresses();
  const localUrl = `http://localhost:${server.port}`;
  const lanUrl = lan ? `http://${lan}:${server.port}` : null;

  console.log('');
  console.log('  Calculator dev server');
  console.log(`  local   ${localUrl}`);
  if (lanUrl) console.log(`  network ${lanUrl}`);
  console.log('');

  if (lanUrl) {
    await printQrCode(lanUrl);
    console.log('  Note: http:// on a LAN address is not a secure origin, so the service worker');
    console.log('  will not register there. Offline mode and "Add to Home Screen" need');
    console.log(`  ${localUrl} (localhost is trusted) or an https tunnel.`);
    console.log('');
  }

  const shutdown = async () => {
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
