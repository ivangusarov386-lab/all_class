import { test, expect } from '@playwright/test';
import { rememberTestClass } from '../fixtures/class-profile.js';
import { missingReplacementWorkbook } from '../fixtures/missing-replacement.js';

const exportURL = 'https://docs.google.com/spreadsheets/d/**/export?format=xlsx';
test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
  await page.route(exportURL, route => route.abort('internetdisconnected'));
});

test('school branding and a calendar below the week stay clear on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await expect(page.locator('.brand-copy')).toContainText('Школьное расписание');
  await expect(page.locator('.school-name')).toHaveText('ЗилАрт 548');
  await expect(page.locator('.topbar button')).toHaveCount(0);
  await expect(page.locator('.calendar-toolbar #toggle-calendar')).toHaveCount(0);
  const week = await page.locator('.week').boundingBox();
  const trigger = page.getByRole('button', { name: 'Открыть календарь', exact: true });
  const button = await trigger.boundingBox();
  expect(button.y).toBeGreaterThanOrEqual(week.y + week.height);
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Календарь', exact: true });
  await expect(calendar).toBeVisible();
  await expect(page.locator('.week-day')).toHaveCount(7);
  const bounds = await calendar.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(calendar).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('staff tools require the password and are locked again after a reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#source-dialog')).toHaveCount(0);
  await expect(page.locator('#import-file')).toHaveCount(0);
  const staff = page.getByRole('button', { name: 'Для сотрудников', exact: true });
  await staff.click();
  await expect(page.getByRole('dialog', { name: 'Для сотрудников', exact: true })).toBeVisible();
  await expect(page.locator('#source-password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#source-password')).toBeFocused();
  await page.locator('#source-password').fill('wrong');
  await page.locator('#source-password').press('Enter');
  await expect(page.locator('#password-error')).toHaveText('Неверный пароль. Попробуйте ещё раз.');
  await expect(page.locator('#source-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#access-dialog')).toBeHidden();
  await expect(staff).toBeFocused();
  await staff.click();
  await expect(page.locator('#source-password')).toHaveValue('');
  await expect(page.locator('#password-error')).toBeHidden();
  await page.locator('#source-password').fill('548.8');
  await page.locator('#source-password').press('Enter');
  await expect(page.getByRole('dialog', { name: 'Источники расписания', exact: true })).toBeVisible();
  await expect(page.locator('#import-file')).toBeAttached();
  await page.locator('#close-dialog').click();
  await expect(staff).toBeFocused();
  await page.reload();
  await expect(page.locator('#source-dialog')).toHaveCount(0);
  await staff.click();
  await expect(page.locator('#access-dialog')).toBeVisible();
});

test('background refresh preserves the password field and the open calendar', async ({ page }) => {
  let release;
  let responseReady = new Promise(resolve => { release = resolve; });
  await page.route(exportURL, async route => {
    await responseReady;
    await route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: missingReplacementWorkbook() });
  });
  await page.goto('./');
  await page.locator('#details').click();
  await page.locator('#source-password').fill('548');
  release();
  await expect(page.locator('#sync-status')).toContainText('Google Таблицы');
  await expect(page.locator('#access-dialog')).toBeVisible();
  await expect(page.locator('#source-password')).toHaveValue('548');
  await expect(page.locator('#source-password')).toBeFocused();
  await page.keyboard.press('Escape');
  responseReady = new Promise(resolve => { release = resolve; });
  await page.locator('#refresh').click();
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-month').focus();
  await page.selectOption('#calendar-month', '2026-09');
  release();
  await expect(page.locator('#sync-status')).toContainText('Google Таблицы');
  await expect(page.locator('#calendar-dialog')).toBeVisible();
  await expect(page.locator('#calendar-month')).toHaveValue('2026-09');
  await expect(page.locator('#calendar-month')).toBeFocused();
  await page.locator('#close-calendar').click();
  await expect(page.locator('.class-badge')).toHaveText('6М');
});
