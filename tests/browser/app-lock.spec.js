import { test, expect } from '@playwright/test';
import { rememberTestClass } from '../fixtures/class-profile.js';

test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '9Ц');
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00Z'));
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort());
});

async function digits(page, code) {
  for (const digit of code) await page.locator(`[data-pin-digit="${digit}"]`).click();
}
async function setPin(page, code = '5480') {
  await digits(page, code);
  await expect(page.locator('#entry-title')).toHaveText('Повторите PIN-код');
  await digits(page, code);
  await expect(page.locator('.pin-lock')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toBeVisible();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
}

test('first entry has an onscreen keypad with no text inputs and remembers opting out', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');
  await expect(page.locator('#entry-title')).toHaveText('Придумайте PIN-код');
  await expect(page.locator('[data-pin-digit]')).toHaveCount(10);
  await expect(page.locator('.pin-lock input')).toHaveCount(0);
  await expect(page.locator('.calendar')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#entry-without').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await page.reload();
  await expect(page.locator('.entry-lock')).toHaveCount(0);
});

test('PIN confirmation, salted verifier and reload protection work with taps only', async ({ page }) => {
  await page.goto('./'); await digits(page, '5480'); await digits(page, '1111');
  await expect(page.locator('#entry-error')).toContainText('не совпадают');
  await digits(page, '5480'); await expect(page.locator('.class-badge')).toHaveText('9Ц');
  const raw = await page.evaluate(() => localStorage.getItem('all-class-entry-lock-v1'));
  const config = JSON.parse(raw);
  expect(config.input).toBe('pin'); expect(config.length).toBe(4); expect(config.iterations).toBe(600000);
  expect(config.salt).toMatch(/^[a-f0-9]{32}$/); expect(config.verifier).toMatch(/^[a-f0-9]{64}$/);
  expect(raw).not.toContain('"5480"');
  await page.reload(); await expect(page.locator('#entry-title')).toHaveText('Введите PIN-код');
  await expect(page.locator('.calendar')).toHaveCount(0);
  await expect(page.locator('#entry-without')).toBeHidden();
  await page.keyboard.press('Escape'); await expect(page.locator('.pin-lock')).toBeVisible();
  await digits(page, '1111'); await expect(page.locator('#entry-error')).toContainText('Неверный PIN-код');
  await expect(page.locator('.pin-dots .filled')).toHaveCount(0);
  await expect(page.locator('.calendar')).toHaveCount(0);
  await digits(page, '5480'); await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await page.locator('#reset-class').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('all-class-entry-lock-v1')).mode)).toBe('password');
});

test('backspace, clear and physical keyboard support the same masked PIN pad', async ({ page }) => {
  await page.goto('./'); await digits(page, '12'); await expect(page.locator('.pin-dots .filled')).toHaveCount(2);
  await page.locator('#pin-delete').click(); await expect(page.locator('.pin-dots .filled')).toHaveCount(1);
  await page.locator('#pin-clear').click(); await expect(page.locator('.pin-dots .filled')).toHaveCount(0);
  await digits(page, '12');
  await page.evaluate(() => { const data = new DataTransfer(); data.setData('text', '5480'); document.querySelector('.pin-lock').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); });
  await expect(page.locator('#entry-title')).toHaveText('Повторите PIN-код');
  for (const digit of '5480') await page.keyboard.press(digit);
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
});

test('changing and disabling authenticate the current PIN and retain notes', async ({ page }) => {
  await page.goto('./'); await page.locator('#entry-without').click();
  await page.locator('#lesson-note-3').click(); await page.locator('#note-text').fill('Сохранённая заметка'); await page.locator('#save-note').click();
  await page.locator('#entry-settings').click(); await setPin(page);
  await page.locator('#entry-settings').click(); await digits(page, '1111'); await expect(page.locator('#entry-error')).toContainText('Неверный PIN-код');
  await expect(page.locator('#entry-without')).toBeHidden();
  await digits(page, '5480'); await expect(page.locator('#entry-title')).toHaveText('Настройки PIN-кода');
  await page.locator('#pin-change').click(); await setPin(page, '2468');
  await page.reload(); await digits(page, '2468'); await expect(page.locator('.subject-note-text').first()).toHaveText('Сохранённая заметка');
  await page.locator('#entry-settings').click(); await digits(page, '2468'); await expect(page.locator('#entry-without')).toHaveText('Отключить PIN-код');
  await page.locator('#entry-without').click(); await expect(page.locator('.pin-lock')).toHaveCount(0);
  await page.reload(); await expect(page.locator('.class-badge')).toHaveText('9Ц');
});

test('legacy text passwords must be verified once before conversion to PIN', async ({ page }) => {
  await page.goto('./'); await page.locator('#entry-without').click();
  await page.evaluate(async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('Школа548!'), 'PBKDF2', false, ['deriveBits']);
    const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, 256));
    const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('all-class-entry-lock-v1', JSON.stringify({ version: 1, mode: 'password', salt: hex(salt), verifier: hex(hash), iterations: 600000 }));
  });
  await page.reload(); await expect(page.locator('#entry-title')).toHaveText('Введите прежний пароль');
  await page.locator('#entry-password').fill('wrong'); await page.locator('#entry-submit').click(); await expect(page.locator('#entry-error')).toContainText('Неверный пароль');
  await expect(page.locator('.calendar')).toHaveCount(0);
  await page.locator('#entry-password').fill('Школа548!'); await page.locator('#entry-submit').click();
  await expect(page.locator('#entry-title')).toHaveText('Придумайте PIN-код'); await expect(page.locator('.calendar')).toHaveCount(0);
  await setPin(page); await page.reload(); await expect(page.locator('#entry-title')).toHaveText('Введите PIN-код');
  await expect(page.locator('.pin-lock input')).toHaveCount(0); await digits(page, '5480'); await expect(page.locator('.class-badge')).toHaveText('9Ц');
});

test('corrupt records fail closed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('all-class-entry-lock-v1', '{broken'));
  await page.goto('./'); await expect(page.locator('#entry-title')).toHaveText('Не удалось прочитать настройки');
  await expect(page.locator('.calendar')).toHaveCount(0);
});

test('failed writes never claim protection and permit an explicit single-visit opt-out', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto('./'); await digits(page, '5480'); await digits(page, '5480');
  await expect(page.locator('#entry-error')).not.toBeEmpty(); await expect(page.locator('.calendar')).toHaveCount(0);
  await page.locator('#entry-without').click(); await expect(page.locator('#entry-once')).toBeVisible(); await page.locator('#entry-once').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
});
