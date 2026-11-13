import { test, expect } from '@playwright/test';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';
import { selectMonth } from '../fixtures/ui.js';
import { missingReplacementWorkbook } from '../fixtures/missing-replacement.js';
import { NOTES_STORAGE_KEY } from '../../src/notes.js';

const googleExport = 'https://docs.google.com/spreadsheets/d/**/export?format=xlsx';
const lesson = (page, number) => page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: new RegExp(`^${number}$`) }) });
const preview = (page, number) => lesson(page, number).locator('.subject-note-text');
async function writeNote(page, number, text) {
  await page.locator(`#lesson-note-${number}`).click();
  await page.getByLabel('Текст заметки', { exact: true }).fill(text);
  await page.locator('#save-note').click();
  await expect(page.locator('#note-dialog')).toHaveCount(0);
}

test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.clock.setFixedTime(new Date('2026-11-12T09:00:00Z'));
  await page.route(googleExport, route => route.abort('internetdisconnected'));
});

test('every lesson has a note button and a subject note survives other lessons, months and reloads until deleted', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  expect(await page.locator('[data-note-subjects]').count()).toBe(await page.locator('.lesson').count());
  const text = 'Взять тетрадь в клетку\nПовторить дроби';
  await writeNote(page, 4, text);
  await expect(preview(page, 4)).toHaveText(text);
  await page.locator('#prev').click();
  await expect(preview(page, 4)).toHaveText(text);
  await expect(preview(page, 5)).toHaveText(text);
  await expect(preview(page, 1)).toHaveCount(0); // Russian is a different subject at the same school.
  await selectMonth(page, '2026-12');
  await page.locator('#calendar-day-2026-12-03').click();
  await expect(preview(page, 4)).toHaveText(text);
  await page.reload();
  await expect(preview(page, 4)).toHaveText(text);
  await page.locator('#lesson-note-4').click();
  await expect(page.locator('#note-current-subject')).toHaveText('Математика');
  await expect(page.locator('#note-text')).toHaveValue(text);
  await page.locator('#delete-note').click();
  await expect(page.locator('#note-dialog')).toHaveCount(0);
  await expect(preview(page, 4)).toHaveCount(0);
  await page.locator('#prev').click();
  await expect(preview(page, 4)).toHaveCount(0);
  await expect(preview(page, 5)).toHaveCount(0);
  await page.reload();
  await expect(preview(page, 4)).toHaveCount(0);
});

test('resetting the class preserves personal notes without showing them in another class', async ({ page }) => {
  await page.goto('./');
  await writeNote(page, 4, 'Заметка 6М');
  await chooseClass(page, '5А');
  await expect(preview(page, 2)).toHaveCount(0); // 5А mathematics on Thursday.
  await writeNote(page, 2, 'Заметка 5А');
  await chooseClass(page, '6М');
  await expect(preview(page, 4)).toHaveText('Заметка 6М');
  await chooseClass(page, '5А');
  await expect(preview(page, 2)).toHaveText('Заметка 5А');
});

test('different subjects at one period have separate notes and language subgroups share one note', async ({ page }) => {
  await page.goto('./');
  await chooseClass(page, '5А');
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-09').click();
  await page.locator('#lesson-note-2').click();
  await expect(page.locator('#note-subject option')).toHaveCount(2);
  await page.selectOption('#note-subject', 'Бионика (ПДОУ)');
  await page.locator('#note-text').fill('Взять альбом');
  await page.selectOption('#note-subject', 'Дополнительный практикум по программированию (ПДОУ)');
  await page.locator('#note-text').fill('Зарядить ноутбук');
  await page.selectOption('#note-subject', 'Бионика (ПДОУ)');
  await expect(page.locator('#note-text')).toHaveValue('Взять альбом');
  await page.locator('#save-note').click();
  await expect(preview(page, 2)).toHaveText(['Взять альбом', 'Зарядить ноутбук']);
  await page.locator('#lesson-note-3').click();
  await expect(page.locator('#note-subject')).toHaveCount(0);
  await page.locator('#note-text').fill('Взять словарь');
  await page.locator('#save-note').click();
  await expect(lesson(page, 3).locator('.original')).toHaveCount(2);
  await expect(preview(page, 3)).toHaveText('Взять словарь');
  await page.locator('#lesson-note-2').click();
  await page.selectOption('#note-subject', 'Бионика (ПДОУ)');
  await page.locator('#note-text').fill('Альбом и карандаш');
  await page.selectOption('#note-subject', 'Дополнительный практикум по программированию (ПДОУ)');
  await page.locator('#delete-note').click();
  await expect(page.locator('#note-dialog')).toBeVisible();
  await page.selectOption('#note-subject', 'Бионика (ПДОУ)');
  await expect(page.locator('#note-text')).toHaveValue('Альбом и карандаш');
  await page.locator('#save-note').click();
  await expect(preview(page, 2)).toHaveText('Альбом и карандаш');
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-16').click();
  await expect(preview(page, 2)).toHaveText('Альбом и карандаш');
  await expect(preview(page, 3)).toHaveText('Взять словарь');
});

test('notes render literal text and cancel or Escape cannot overwrite a saved note', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  const text = '<img src=x onerror="alert(1)">\nЧитать <b>внимательно</b> 🙂';
  await writeNote(page, 1, text);
  await expect(preview(page, 1)).toHaveText(text);
  await expect(preview(page, 1).locator('img, b')).toHaveCount(0);
  await page.locator('#lesson-note-1').click();
  await page.locator('#note-text').fill('Не сохранять');
  await page.keyboard.press('Escape');
  await expect(preview(page, 1)).toHaveText(text);
  await expect(page.locator('#lesson-note-1')).toBeFocused();
  await page.locator('#lesson-note-1').click();
  await expect(page.locator('#note-text')).toHaveValue(text);
  const bounds = await page.locator('#note-dialog').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#note-text').fill('Тоже не сохранять');
  await page.locator('#cancel-note').click();
  await expect(preview(page, 1)).toHaveText(text);
});

test('background replacement refresh preserves an unfinished note and its cursor', async ({ page }) => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route(googleExport, async route => {
    await ready;
    await route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: missingReplacementWorkbook() });
  });
  await page.goto('./');
  await page.locator('#lesson-note-4').click();
  await page.locator('#note-text').fill('Несохранённая важная заметка');
  await page.locator('#note-text').evaluate(element => element.setSelectionRange(4, 4));
  release();
  await expect(page.locator('#sync-status')).toContainText('Google Таблицы');
  await expect(page.locator('#note-dialog')).toBeVisible();
  await expect(page.locator('#note-text')).toHaveValue('Несохранённая важная заметка');
  await expect(page.locator('#note-text')).toBeFocused();
  expect(await page.locator('#note-text').evaluate(element => element.selectionStart)).toBe(4);
  await page.locator('#save-note').click();
  await expect(preview(page, 4)).toHaveText('Несохранённая важная заметка');
});

test('another browser tab updates saved notes without clearing the draft or other subjects', async ({ page, baseURL }) => {
  await page.goto('./');
  await expect(page.locator('#lesson-note-4')).toBeVisible();
  const other = await page.context().newPage();
  await other.clock.setFixedTime(new Date('2026-11-12T09:00:00Z'));
  await other.route(googleExport, route => route.abort('internetdisconnected'));
  await other.goto(baseURL);
  await other.locator('#lesson-note-4').click();
  await other.locator('#note-text').fill('Математика из второй вкладки');
  await writeNote(page, 1, 'Русский язык из первой вкладки');
  await expect(other.locator('#note-text')).toHaveValue('Математика из второй вкладки');
  await other.locator('#save-note').click();
  await expect(preview(page, 4)).toHaveText('Математика из второй вкладки');
  await expect(preview(other, 1)).toHaveText('Русский язык из первой вкладки');
  await expect(preview(other, 4)).toHaveText('Математика из второй вкладки');
  await other.close();
});

test('storage errors keep the editor open with the unsaved text and a visible explanation', async ({ page }) => {
  await page.addInitScript(key => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
  }, NOTES_STORAGE_KEY);
  await page.goto('./');
  await page.locator('#lesson-note-4').click();
  await page.locator('#note-text').fill('Этот текст нельзя потерять');
  await page.locator('#save-note').click();
  await expect(page.locator('#note-dialog')).toBeVisible();
  await expect(page.locator('#note-error')).toContainText('Не удалось сохранить');
  await expect(page.locator('#note-text')).toHaveValue('Этот текст нельзя потерять');
  expect(await page.evaluate(key => localStorage.getItem(key), NOTES_STORAGE_KEY)).toBe(null);
  await page.locator('#cancel-note').click();
  await expect(preview(page, 4)).toHaveCount(0);
});
