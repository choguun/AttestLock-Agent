import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function assetPath(url = '/') {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  const requested = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) return null;
  try {
    return (await stat(requested)).isFile() ? requested : resolve(root, 'index.html');
  } catch {
    return resolve(root, 'index.html');
  }
}

createServer(async (request, response) => {
  const path = await assetPath(request.url);
  if (!path) {
    response.writeHead(400).end('Bad request');
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(500).end('Unable to serve the application');
  }
}).listen(port, '0.0.0.0');
