import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { loadStudent, storeStudent, studentPasses, rosterForClass, passRequest, moscowExit, PASS_ENDPOINT, STUDENT_STORAGE_KEY } from '../src/passes.js';
import { passQR } from '../src/pass-qr.js';
const student = { studentId: 1, studentName: 'Александров Артём', className: '9А' };
const payload = { version: 1, type: 'school-exit-pass', id: 'd4f0378c-8f03-46f5-8e8c-68d74e61db3a', ...student,
  exitAt: '2026-11-27T14:30:00+03:00', timeZone: 'Europe/Moscow', createdAt: '2026-11-26T18:00:00.000Z' };
const pass = { ...payload, qrPayload: JSON.stringify(payload, null, 2) };

test('student selection stores only stable ID and exact class and survives reopening', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(loadStudent(storage), null);
  assert.equal(storeStudent(student, storage), true);
  assert.deepEqual(JSON.parse(values.get(STUDENT_STORAGE_KEY)), { studentId: 1, className: '9А' });
  assert.deepEqual(loadStudent(storage), { studentId: 1, className: '9А' });
  storeStudent(null, storage); assert.equal(loadStudent(storage), null);
  storage.setItem(STUDENT_STORAGE_KEY, '{bad'); assert.equal(loadStudent(storage), null);
  storage.setItem(STUDENT_STORAGE_KEY, '{"studentId":"1","className":"9А"}'); assert.equal(loadStudent(storage), null);
  const denied = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.equal(loadStudent(denied), null); assert.equal(storeStudent(student, denied), false);
});
test('roster is restricted to the current class and stable unique IDs', () => {
  assert.deepEqual(rosterForClass([student, student, { ...student, studentId: 2, className: '9Ц' }, { ...student, studentId: '3' }], '9А'), [student]);
});
test('passes exclude foreign ID OR class even when the response includes foreign malformed records', () => {
  assert.deepEqual(studentPasses([pass, pass, { ...pass, studentId: 2, qrPayload: 'bad' }, { ...pass, className: '9Ц' }], student), [pass]);
  assert.deepEqual(studentPasses([pass], { studentId: 2, className: '9А' }), []);
  assert.deepEqual(studentPasses([pass], { studentId: 1, className: '9Ц' }), []);
  assert.throws(() => studentPasses([{ ...pass, id: 'substituted' }], student), /не совпадают/);
  assert.throws(() => studentPasses([{ ...pass, qrPayload: 'bad' }], student), /Повреждён/);
});
test('exit time is formatted in Moscow independently of runtime zone', () => {
  assert.equal(moscowExit('2026-11-27T11:30:00Z').time, '14:30');
  assert.match(moscowExit('2026-11-26T21:30:00Z').date, /27 ноября 2026/);
});
test('API uses the configured endpoint, POST simple request and no credentials', async () => {
  let called = false;
  const result = await passRequest({ action: 'students' }, { fetcher: async (url, options) => {
    called = true; assert.equal(url, PASS_ENDPOINT); assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=UTF-8');
    assert.equal(options.credentials, 'omit'); assert.deepEqual(JSON.parse(options.body), { action: 'students' });
    return { ok: true, json: async () => ({ ok: true, students: [student] }) };
  } });
  assert(called); assert.equal(result.students[0].studentId, 1);
  await assert.rejects(passRequest({ action: 'studentPasses' }, { fetcher: async () => ({ ok: true, json: async () => ({ ok: false, error: 'Неизвестная операция.' }) }) }), /развёртывание Apps Script/);
  await assert.rejects(passRequest({ action: 'students' }, { fetcher: async () => ({ ok: false }) }), /соединения/);
});
test('a scanner decodes the generated QR to the EXACT stored UTF-8 payload, original UUID and Cyrillic name', () => {
  const svg = passQR(pass.qrPayload);
  const size = Number(svg.match(/viewBox="0 0 (\d+) /)[1]);
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const match of svg.matchAll(/M(\d+),(\d+)l4,0 0,4 -4,0 0,-4z/g)) {
    for (let y = Number(match[2]); y < Number(match[2]) + 4; y++) for (let x = Number(match[1]); x < Number(match[1]) + 4; x++) {
      const pixel = (y * size + x) * 4; data[pixel] = data[pixel + 1] = data[pixel + 2] = 0;
    }
  }
  const decoded = jsQR(data, size, size);
  assert(decoded, 'QR must be scannable with its four-module quiet zone');
  assert.equal(decoded.data, pass.qrPayload);
  assert.deepEqual(decoded.binaryData, [...new TextEncoder().encode(pass.qrPayload)]);
  assert.equal(JSON.parse(decoded.data).id, pass.id);
  assert.equal(JSON.parse(decoded.data).studentName, 'Александров Артём');
});

test('a browser blocking access to localStorage cannot prevent application startup', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  try { assert.equal(loadStudent(), null); assert.equal(storeStudent(student), false); }
  finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});
