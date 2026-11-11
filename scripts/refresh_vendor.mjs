import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

// Commit these browser-ready files so Pages can serve main without a build.
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve('xlsx/package.json'));
const target = fileURLToPath(new URL('../vendor/', import.meta.url));
await mkdir(target, { recursive: true });
await copyFile(path.join(source, 'xlsx.mjs'), path.join(target, 'xlsx.js'));
await copyFile(path.join(source, 'LICENSE'), path.join(target, 'xlsx.LICENSE'));
console.log('Updated browser-ready SheetJS module and license from the locked npm dependency.');
