import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';
import { selectMonth, openSources } from '../fixtures/ui.js';

const lesson = (page, number) => page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: new RegExp(`^${number}$`) }) });
test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.clock.setFixedTime(new Date('2026-11-12T09:00:00Z'));
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
});

test('the corrected XML provides exact subjects, assigned rooms and subgroup names on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('.calendar h2')).toContainText('12 ноября');
  await expect(lesson(page, 1).locator('.original h3')).toHaveText('Русский язык');
  await expect(lesson(page, 2).locator('.original h3')).toHaveText('Литература');
  await expect(lesson(page, 3).locator('.original h3')).toHaveText('Изобразительное искусство');
  await expect(lesson(page, 3).locator('.original p')).toContainText('Машицына Е.А. · Каб. 4.15');
  await expect(lesson(page, 5).locator('.original p').nth(0)).toContainText('Группа 1');
  await expect(lesson(page, 5).locator('.original p').nth(1)).toContainText('Группа 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openSources(page);
  await expect(page.locator('#source-dialog')).toContainText('от 031126_1212.xml · aSc Timetables XML');
  await page.locator('#close-dialog').click();
  await chooseClass(page, '5А');
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-09').click();
  await expect(lesson(page, 1).locator('.original h3')).toHaveText('Разговоры о важном (ВД)');
  await expect(lesson(page, 2).locator('.original h3').nth(0)).toHaveText('Бионика (ПДОУ)');
  await expect(lesson(page, 2).locator('.original').filter({ hasText: 'РТ+АРД' })).toContainText('Кабинет не указан');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('even a newer manual cache for an old timetable cannot hide corrected subjects', async ({ page }) => {
  const snapshot = JSON.parse(fs.readFileSync('data/replacements.json'));
  await page.addInitScript(snapshot => {
    const previous = { ...snapshot, scheduleRevision: 'previous-base-timetable', origin: 'file', fetchedAt: '2099-01-01T00:00:00Z', coverage: ['2026-11-12'], unresolved: [] };
    previous.entries = [{ date: '2026-11-12', className: '6М', lesson: 3, subject: 'НЕВЕРНОЕ СТАРОЕ РАСПИСАНИЕ', teacher: 'Старый импорт', targetTeachers: ['Машицына Е.А.'] }];
    localStorage.setItem('school-replacements-v4', JSON.stringify(previous));
    localStorage.setItem('school-replacements-v3', JSON.stringify({ ...previous, version: 3 }));
  }, snapshot);
  await page.goto('./');
  await expect(lesson(page, 3).locator('.original h3')).toHaveText('Изобразительное искусство');
  await expect(lesson(page, 3).locator('.original p')).toContainText('Каб. 4.15');
  await expect(page.locator('.replacement')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await openSources(page);
  await expect(page.locator('#import-status')).toContainText('загрузить заново');
  await page.reload();
  await expect(lesson(page, 3).locator('.original h3')).toHaveText('Изобразительное искусство');
  await expect(page.locator('.replacement')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toHaveText('6М');
});

test('6Е has one confirmed Monday lesson with Kotnov and no obsolete unplaced warning', async ({ page }) => {
  await page.goto('./');
  await chooseClass(page, '6Е');
  await expect(page.locator('.unscheduled')).toHaveCount(0);
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-09').click();
  await expect(lesson(page, 1).locator('.original')).toHaveCount(1);
  await expect(lesson(page, 1).locator('.original h3')).toHaveText('Разговоры о важном (ВД)');
  await expect(lesson(page, 1).locator('.original p')).toContainText('Котнов К.В. · Каб. 3.39');
  await expect(lesson(page, 4).locator('.original p')).toContainText('Попова Ю.Н.');
});
