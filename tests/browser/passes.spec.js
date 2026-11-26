import { test, expect } from '../fixtures/app-test.js';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';
import jsQR from 'jsqr';
const endpoint = 'https://script.google.com/macros/s/**/exec';
const students = [
  { studentId: 1, studentName: 'Александров Артём', className: '9А' },
  { studentId: 2, studentName: 'Васильева София', className: '9А' },
  { studentId: 3, studentName: 'Иванов Иван', className: '9Ц' },
];
function makePass(student = students[0], id = 'd4f0378c-8f03-46f5-8e8c-68d74e61db3a') {
  const value = { version: 1, type: 'school-exit-pass', id, ...student,
    exitAt: '2026-11-27T14:30:00+03:00', timeZone: 'Europe/Moscow', createdAt: '2026-11-26T18:00:00.000Z' };
  return { ...value, qrPayload: JSON.stringify(value, null, 2) };
}
async function setup(page, baseURL, handler) {
  await rememberTestClass(page, baseURL, '9А');
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
  await page.route(endpoint, async route => {
    const request = route.request().postDataJSON();
    if (request.action === 'students') return route.fulfill({ json: { ok: true, students } });
    await handler(route, request);
  });
  await page.goto('./');
  await expect(page.locator('#student-select')).toBeEnabled();
}
async function open(page, id = '1') {
  await page.selectOption('#student-select', id);
  await page.locator('#show-passes').click();
}

test('new teacher pass appears at 15s; foreign ID and class never appear; polling stops on schedule', async ({ page, baseURL }) => {
  await page.clock.install();
  let records = [], reads = 0;
  await setup(page, baseURL, (route, request) => {
    reads++; expect(request).toEqual({ action: 'studentPasses', studentId: 1, className: '9А' });
    return route.fulfill({ json: { ok: true, passes: records } });
  });
  await open(page);
  await expect(page.locator('#passes-panel')).toContainText('Пропусков пока нет');
  expect(reads).toBe(1);
  records = [makePass(), makePass(students[1]), makePass({ ...students[0], className: '9Ц' })];
  await page.clock.fastForward(15000);
  await expect(page.locator('.pass-card')).toHaveCount(1);
  await expect(page.locator('.pass-card')).toContainText('Александров Артём');
  await expect(page.locator('.pass-card')).toContainText('14:30');
  await expect(page.locator('.pass-card')).toContainText('27 ноября 2026');
  await expect(page.locator('.pass-card')).not.toContainText('Васильева');
  expect(reads).toBe(2);
  await page.locator('#show-schedule').click();
  await expect(page.locator('#schedule-panel')).toBeVisible();
  await page.clock.fastForward(45000); expect(reads).toBe(2);
  await page.locator('#show-passes').click();
  await expect.poll(() => reads).toBe(3);
});

test('changing student clears old QR immediately and ignores a delayed old response; refresh and restore work', async ({ page, baseURL }) => {
  let release, started = false, delay = false;
  const waiting = new Promise(resolve => { release = resolve; });
  await setup(page, baseURL, async (route, request) => {
    if (request.studentId === 1 && delay) { started = true; await waiting; }
    try { await route.fulfill({ json: { ok: true, passes: [makePass(students[request.studentId - 1])] } }); } catch {}
  });
  await open(page); await expect(page.locator('.pass-card')).toContainText('Александров');
  delay = true;
  await page.locator('#refresh-passes').click();
  await expect.poll(() => started).toBe(true);
  await page.selectOption('#student-select', '2');
  await expect(page.locator('.pass-card')).not.toContainText('Александров');
  release();
  await expect(page.locator('.pass-card')).toContainText('Васильева');
  await page.reload();
  await expect(page.locator('#student-select')).toHaveValue('2');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('all-class-student-v1')));
  expect(stored).toEqual({ studentId: 2, className: '9А' });
  await page.locator('#show-passes').click();
  await expect(page.locator('.pass-card')).toContainText('Васильева');
  await chooseClass(page, '9Ц');
  await expect(page.locator('.pass-card')).toHaveCount(0);
  await expect(page.locator('#student-select')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('all-class-student-v1'))).toBeNull();
});

test('connection errors, retry and missing deployed operation have clear states', async ({ page, baseURL }) => {
  let error = 'Неизвестная операция.';
  await setup(page, baseURL, route => error === 'network' ? route.abort('internetdisconnected')
    : route.fulfill({ json: error ? { ok: false, error } : { ok: true, passes: [makePass()] } }));
  await open(page);
  await expect(page.locator('#passes-panel [role=alert]')).toContainText('развёртывание Apps Script');
  error = ''; await page.locator('#refresh-passes').click();
  await expect(page.locator('.pass-card')).toHaveCount(1);
  error = 'network'; await page.locator('#refresh-passes').click();
  await expect(page.locator('#passes-panel [role=alert]')).toContainText('соединения');
  await expect(page.locator('.pass-card')).toHaveCount(0);
});

test('mobile card fits 360px and the rendered QR scans to the exact original UTF-8 string', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const pass = makePass();
  await setup(page, baseURL, route => route.fulfill({ json: { ok: true, passes: [pass] } }));
  await open(page); await expect(page.locator('.pass-code svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const pixels = await page.locator('.pass-code svg').evaluate(async svg => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      image.src = url; await image.decode();
      const size = Math.round(svg.getBoundingClientRect().width);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, size, size);
      return { size, data: Array.from(ctx.getImageData(0, 0, size, size).data) };
    } finally { URL.revokeObjectURL(url); }
  });
  const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.size, pixels.size);
  expect(decoded?.data).toBe(pass.qrPayload);
  expect(decoded?.binaryData).toEqual([...new TextEncoder().encode(pass.qrPayload)]);
  await page.screenshot({ path: `/tmp/all-class-passes-${test.info().project.name}-mobile.png`, fullPage: true });
});

test('roster errors can be retried and classes without students retain their schedule', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '9Ц');
  let failed = true;
  await page.route(endpoint, route => failed ? route.abort('internetdisconnected') : route.fulfill({ json: { ok: true, students: students.slice(0, 2) } }));
  await page.goto('./');
  await expect(page.locator('#student-hint')).toContainText('соединения');
  failed = false; await page.locator('#retry-students').click();
  await expect(page.locator('#student-hint')).toContainText('нет учеников этого класса');
  await expect(page.locator('#schedule-panel')).toBeVisible();
  await page.locator('#show-passes').click();
  await expect(page.locator('#passes-panel')).toContainText('Выберите ученика');
});

test('polling pauses in a hidden document and resumes with an immediate refresh', async ({ page, baseURL }) => {
  await page.clock.install();
  let reads = 0;
  await setup(page, baseURL, route => { reads++; return route.fulfill({ json: { ok: true, passes: [] } }); });
  await open(page); await expect.poll(() => reads).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(45000); expect(reads).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(15000); await expect.poll(() => reads).toBe(3);
});
