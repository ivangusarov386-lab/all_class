import { test, expect } from '@playwright/test';
import { rememberTestClass } from '../fixtures/class-profile.js';

test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '9Ц');
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00Z'));
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort());
});

async function setPassword(page, password = 'Школа548!') {
  await page.locator('#entry-password').fill(password);
  await page.locator('#entry-confirm').fill(password);
  await page.locator('#entry-submit').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
}

test('first entry offers no password and remembers the choice without changing class or notes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await expect(page.locator('#entry-title')).toHaveText('Защитить вход паролем?');
  await expect(page.locator('.calendar')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#entry-without').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await page.reload();
  await expect(page.locator('.entry-lock')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
});

test('password is salted and hashed, reload hides all lessons, wrong passwords and Escape cannot unlock', async ({ page }) => {
  await page.goto('./');
  await page.locator('#entry-password').fill('Школа548!');
  await page.locator('#entry-confirm').fill('Другое');
  await page.locator('#entry-submit').click();
  await expect(page.locator('#entry-error')).toHaveText('Пароли не совпадают. Повторите ввод.');
  await setPassword(page);
  const raw = await page.evaluate(() => localStorage.getItem('all-class-entry-lock-v1'));
  const config = JSON.parse(raw);
  expect(raw).not.toContain('Школа548!');
  expect(config.iterations).toBe(600000);
  expect(config.salt).toMatch(/^[a-f0-9]{32}$/);
  expect(config.verifier).toMatch(/^[a-f0-9]{64}$/);
  await page.reload();
  await expect(page.locator('#entry-title')).toHaveText('Введите пароль');
  await expect(page.locator('.calendar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.entry-lock')).toBeVisible();
  await page.locator('#entry-password').fill('Неверный');
  await page.locator('#entry-submit').click();
  await expect(page.locator('#entry-error')).toContainText('Неверный пароль');
  await expect(page.locator('.calendar')).toHaveCount(0);
  await page.locator('#entry-password').fill('Школа548!');
  await page.locator('#entry-submit').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await page.locator('#reset-class').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('all-class-entry-lock-v1')).mode)).toBe('password');
});

test('enabling, changing and disabling require the current password and preserve saved notes', async ({ page }) => {
  await page.goto('./'); await page.locator('#entry-without').click();
  await page.locator('#lesson-note-3').click(); await page.locator('#note-text').fill('Не потерять заметку'); await page.locator('#save-note').click();
  await page.locator('#entry-settings').click(); await setPassword(page);
  await page.locator('#entry-settings').click();
  await page.locator('#entry-current').fill('wrong'); await page.locator('#entry-without').click();
  await expect(page.locator('#entry-error')).toContainText('Неверный пароль');
  await page.locator('#entry-current').fill('Школа548!');
  await page.locator('#entry-password').fill('Новый548!'); await page.locator('#entry-confirm').fill('Новый548!'); await page.locator('#entry-submit').click();
  await expect(page.locator('.entry-lock')).toHaveCount(0);
  await page.reload(); await page.locator('#entry-password').fill('Новый548!'); await page.locator('#entry-submit').click();
  await expect(page.locator('.subject-note-text').first()).toHaveText('Не потерять заметку');
  await page.locator('#entry-settings').click(); await page.locator('#entry-current').fill('Новый548!'); await page.locator('#entry-without').click();
  await expect(page.locator('.entry-lock')).toHaveCount(0);
  await page.reload(); await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await expect(page.locator('.entry-lock')).toHaveCount(0);
});

test('corrupt records fail closed and failed persistence never claims password protection', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('all-class-entry-lock-v1', '{broken'));
  await page.goto('./');
  await expect(page.locator('#entry-title')).toHaveText('Не удалось прочитать настройки');
  await expect(page.locator('.calendar')).toHaveCount(0);
});

test('blocked writes keep setup open, with an explicit unprotected single-visit option', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto('./');
  await page.locator('#entry-password').fill('Пароль548'); await page.locator('#entry-confirm').fill('Пароль548'); await page.locator('#entry-submit').click();
  await expect(page.locator('#entry-error')).toBeVisible();
  await expect(page.locator('.calendar')).toHaveCount(0);
  await page.locator('#entry-without').click();
  await expect(page.locator('#entry-once')).toBeVisible(); await page.locator('#entry-once').click();
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
});
