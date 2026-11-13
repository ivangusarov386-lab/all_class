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
  '.mp4': 'video/mp4',
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
    const headers = {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    };
    if (request.headers.range) {
      const range = request.headers.range.match(/^bytes=(\d*)-(\d*)$/);
      if (!range || (!range[1] && !range[2])) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` }).end(); return;
      }
      const from = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const to = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (from >= body.length || from > to) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` }).end(); return;
      }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${from}-${to}/${body.length}`, 'Content-Length': to - from + 1 }).end(body.subarray(from, to + 1));
    } else response.writeHead(200, { ...headers, 'Content-Length': body.length }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Static website: http://127.0.0.1:${port}${prefix}`);
});
