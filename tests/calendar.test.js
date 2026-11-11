import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, dateInMonth, monthGrid, monthOptions, shiftMonth } from '../src/calendar.js';

const date = key => new Date(key + 'T12:00:00');

test('month selection clamps long months, handles leap days and crosses year boundaries', () => {
  assert.equal(dateKey(dateInMonth(date('2026-01-31'), '2026-02')), '2026-02-28');
  assert.equal(dateKey(dateInMonth(date('2026-01-31'), '2028-02')), '2028-02-29');
  assert.equal(dateKey(shiftMonth(date('2026-12-31'), 1)), '2027-01-31');
  assert.equal(dateKey(shiftMonth(date('2026-01-31'), -1)), '2025-12-31');
  assert.throws(() => dateInMonth(date('2026-01-31'), '2026-13'));
});

test('month grid starts on Monday and includes every November and leap-February date exactly once', () => {
  const november = monthGrid(date('2026-11-11'));
  assert.equal(november[0].key, '2026-10-26');
  assert.equal(november.at(-1).key, '2026-12-06');
  assert.equal(november.length, 42);
  assert.equal(november.filter(cell => !cell.outside).length, 30);
  assert.equal(new Set(november.map(cell => cell.key)).size, 42);
  const february = monthGrid(date('2028-02-20'));
  assert.equal(february.filter(cell => !cell.outside).length, 29);
  assert(february.some(cell => cell.key === '2028-02-29' && !cell.outside));
});

test('month choices include archive data, future months and the viewed year', () => {
  const choices = monthOptions(date('2026-11-11'), date('2029-02-20'), ['2023-09', '2026-10']);
  for (const key of ['2023-09', '2026-09', '2026-10', '2026-11', '2027-12', '2029-02']) assert(choices.includes(key));
  assert.equal(new Set(choices).size, choices.length);
});
