import { readFile, writeFile } from 'node:fs/promises';
import { EXPORT_URL, readReplacementWorkbook } from '../src/replacements.js';

const schedule = JSON.parse(await readFile(new URL('../data/schedule.json', import.meta.url), 'utf8'));
const input = process.argv[2];
let buffer;
if (input) buffer = await readFile(input);
else {
  const response = await fetch(EXPORT_URL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Google export returned HTTP ${response.status}`);
  buffer = new Uint8Array(await response.arrayBuffer());
}
const result = await readReplacementWorkbook(buffer, schedule);
await writeFile(new URL('../data/replacements.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result.stats, latestDate: result.coverage.at(-1) }, null, 2));
