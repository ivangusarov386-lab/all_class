import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { CLASS_COOKIE_NAME } from '../../src/profile.js';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';
import { selectMonth } from '../fixtures/ui.js';
import { missingReplacementWorkbook } from '../fixtures/missing-replacement.js';

const exportURL = 'https://docs.google.com/spreadsheets/d/**/export?format=xlsx';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
  await page.route(exportURL, route => route.abort('internetdisconnected'));
});

test('first visit requires an explicit class selection and then only shows that timetable', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('dialog', { name: 'Выберите свой класс' })).toBeVisible();
  await expect(page.locator('.calendar')).toHaveCount(0);
  await expect(page.locator('#class-select')).toBeDisabled();
  await expect(page.locator('#open-schedule')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#class-dialog')).toBeVisible();
  await page.selectOption('#grade', '6');
  await expect(page.locator('#class-select')).toBeEnabled();
  await expect(page.locator('#class-select option[value="6М"]')).toHaveCount(1);
  await expect(page.locator('#class-select option[value="5А"]')).toHaveCount(0);
  await expect(page.locator('#open-schedule')).toBeDisabled();
  await page.selectOption('#class-select', '6М');
  await page.locator('#open-schedule').click();
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await expect(page.locator('#class-dialog')).toHaveCount(0);
  await expect(page.locator('#grade')).toHaveCount(0);
  await expect(page.locator('#class-select')).toHaveCount(0);
  const cookie = (await page.context().cookies()).find(cookie => cookie.name === CLASS_COOKIE_NAME);
  expect(decodeURIComponent(cookie.value)).toBe('6М');
  expect(cookie.path).toBe('/all_class/');
  expect(cookie.sameSite).toBe('Lax');
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60);
});

test('return visits restore the class from its cookie and keep day and month navigation', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.goto('./');
  await expect(page.locator('#class-dialog')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await page.locator('#next').click();
  await expect(page.locator('.calendar h2')).toContainText('12 ноября');
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-05').click();
  await expect(page.locator('.replacement p')).toContainText('Шурухина О.С. · Каб. 2.24');
  await page.reload();
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#class-dialog')).toHaveCount(0);
  const nextVisit = await page.context().newPage();
  await nextVisit.route(exportURL, route => route.abort('internetdisconnected'));
  await nextVisit.goto(baseURL);
  await expect(nextVisit.locator('.class-badge')).toHaveText('6М');
  await expect(nextVisit.locator('#class-dialog')).toHaveCount(0);
  await nextVisit.close();
});

test('reset removes the class preference while preserving replacement data and other local settings', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '9Ц');
  const data = JSON.parse(fs.readFileSync('data/replacements.json'));
  await page.addInitScript(data => {
    localStorage.setItem('school-replacements-v3', JSON.stringify({ ...data, origin: 'file' }));
    localStorage.setItem('other-setting', 'keep');
  }, data);
  await page.goto('./');
  await page.locator('#reset-class').click();
  await expect(page.locator('#class-dialog')).toBeVisible();
  await expect(page.locator('.calendar')).toHaveCount(0);
  await expect(page.locator('#grade')).toHaveValue('');
  expect((await page.context().cookies()).some(cookie => cookie.name === CLASS_COOKIE_NAME)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('other-setting'))).toBe('keep');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school-replacements-v3')).entries.length)).toBe(data.entries.length);
  await chooseClass(page, '5А');
  await page.reload();
  await expect(page.locator('.class-badge')).toHaveText('5А');
  await expect(page.locator('#class-dialog')).toHaveCount(0);
});

test('invalid cookie cannot pick an arbitrary timetable and an old browser choice needs confirmation', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '99Х');
  await page.addInitScript(() => localStorage.setItem('school-class', JSON.stringify('6М')));
  await page.goto('./');
  await expect(page.locator('#class-dialog')).toBeVisible();
  await expect(page.locator('.calendar')).toHaveCount(0);
  await expect(page.locator('#grade')).toHaveValue('6');
  await expect(page.locator('#class-select')).toHaveValue('6М');
  await page.locator('#open-schedule').click();
  await expect(page.locator('.class-badge')).toHaveText('6М');
  const cookie = (await page.context().cookies()).find(cookie => cookie.name === CLASS_COOKIE_NAME);
  expect(decodeURIComponent(cookie.value)).toBe('6М');
});

test('a background Google refresh does not erase an unfinished class choice', async ({ page }) => {
  let release;
  const responseReady = new Promise(resolve => { release = resolve; });
  await page.route(exportURL, async route => {
    await responseReady;
    await route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: missingReplacementWorkbook() });
  });
  await page.goto('./');
  await page.selectOption('#grade', '6');
  release();
  await page.waitForFunction(() => localStorage.getItem('school-replacements-v3') !== null);
  await expect(page.locator('#class-dialog')).toBeVisible();
  await expect(page.locator('#grade')).toHaveValue('6');
  await expect(page.locator('#class-select')).toHaveValue('');
  await expect(page.locator('#class-select')).toBeEnabled();
  await page.selectOption('#class-select', '6М');
  await page.locator('#open-schedule').click();
  await expect(page.locator('.class-badge')).toHaveText('6М');
});

test('the initial choice and personal timetable fit a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await expect(page.locator('#class-dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await page.locator('#class-dialog').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await chooseClass(page, '11Ш');
  await expect(page.locator('.class-badge')).toHaveText('11Ш');
  await expect(page.getByRole('button', { name: 'Сбросить класс', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('when cookies are blocked the current choice still works and the limitation is visible', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: () => {} }));
  await page.goto('./');
  await chooseClass(page, '6М');
  await expect(page.locator('.preference-notice')).toContainText('Браузер не разрешил запомнить выбор');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('#class-dialog')).toBeVisible();
});
