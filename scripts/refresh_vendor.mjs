import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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

// A local ESM copy also keeps the unbuilt GitHub Pages entry point working.
const qrSource = path.dirname(require.resolve('qrcode-generator'));
await copyFile(path.join(qrSource, 'qrcode.mjs'), path.join(target, 'qrcode.js'));
await writeFile(path.join(target, 'qrcode.LICENSE'), `QR Code Generator 2.0.4
Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`);
console.log('Updated local QR Code Generator ESM module (2.0.4, MIT).');
