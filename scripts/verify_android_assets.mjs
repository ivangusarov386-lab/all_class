import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const bundled = new URL('android/app/src/main/assets/public/', root);
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(new URL(entry.name + '/', directory), name + '/'));
    else result.push(name);
  }
  return result;
}
const names = await files(dist);
assert(names.includes('index.html'), 'Build the web app before syncing Android');
for (const name of names) assert((await readFile(new URL(name, dist))).equals(await readFile(new URL(name, bundled))), `Stale or missing Android resource: ${name}`);
for (const pattern of [/\.mp4$/, /schedule.*\.json$/, /replacements.*\.json$/, /xlsx.*\.js$/]) assert(names.some(name => pattern.test(name)), `Required offline resource missing: ${pattern}`);
const config = JSON.parse(await readFile(new URL('android/app/src/main/assets/capacitor.config.json', root), 'utf8'));
assert.equal(config.appName, 'All-Class');
assert.equal(config.appId, 'ru.zilart548.allclass');
assert.equal(config.server?.url, undefined, 'DEMO must run from local APK assets');
console.log(`Verified ${names.length} web files copied to ${path.basename(bundled.pathname.slice(0, -1))}; local All-Class app configuration is valid.`);
