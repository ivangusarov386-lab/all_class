import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Deliberately no Vite transforms or rewrites: reproduce Pages under /all_class/.
const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 4175);
const prefix = '/all_class/';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === '/all_class') {
      response.writeHead(301, { Location: prefix }).end();
      return;
    }
    if (!url.pathname.startsWith(prefix)) throw new Error('Not found');
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Not found');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Static website: http://127.0.0.1:${port}${prefix}`);
});
