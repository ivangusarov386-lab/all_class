import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';
import { selectMonth, openSources } from '../fixtures/ui.js';

test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL);
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
});

test('opens under the repository path with no build server or external dependencies', async ({ page }) => {
  const errors = [], responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => responses.push(response));
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await expect(page.locator('.calendar h2')).toContainText('Сегодня');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe('none');
  expect(errors).toEqual([]);
  expect(responses.filter(response => response.status() >= 400).map(response => response.url())).toEqual([]);
  expect(responses.every(response => new URL(response.url()).hostname === '127.0.0.1')).toBe(true);
  expect(responses.some(response => /xlsx.*\.(js|mjs)/.test(response.url()))).toBe(false);

  await chooseClass(page, '5А');
  await page.reload();
  await expect(page.locator('.class-badge')).toHaveText('5А');
  await page.locator('#next').click();
  await expect(page.locator('.calendar h2')).toContainText('12 ноября');
  await page.locator('#prev').click();
  await expect(page.locator('.calendar h2')).toContainText('Сегодня');
  await page.locator('[data-date="2026-11-15"]').click();
  await expect(page.locator('.empty')).toBeVisible();
  await page.locator('#next-school').click();
  await expect(page.locator('.lesson').first()).toBeVisible();
});

test('imports a replacement from the local browser module and retains the original lesson', async ({ page }) => {
  await page.goto('./');
  await openSources(page);
  await expect(page.locator('a[download]')).toHaveAttribute('href', /replacement-template|data:text\/csv/);
  await page.locator('#import-file').setInputFiles({
    name: 'replacements.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Дата;Класс;Урок;Предмет;Учитель;Кабинет\n11.11.2026;9Ц;3;Проверка замены;Тестовый учитель;2.40\n'),
  });
  await expect(page.locator('.replacement h3')).toHaveText('Проверка замены');
  await expect(page.locator('.changed .crossed h3')).toHaveText('Физика');
  await expect(page.locator('.changed .crossed h3')).toHaveCSS('text-decoration-line', 'line-through');
  await page.reload();
  await expect(page.locator('.replacement h3')).toHaveText('Проверка замены');
  await openSources(page);
  await page.locator('#clear').click();
  await expect(page.locator('.replacement')).toHaveCount(0);
});

test('works on a narrow phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.lesson').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chooseClass(page, '11Я');
  await expect(page.locator('.class-badge')).toHaveText('11Я');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('shows a useful message if the app module fails to load', async ({ page }) => {
  await page.route(/\/(?:src\/main\.js|assets\/main-[^/]+\.js)(?:\?.*)?$/, route => route.abort());
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть расписание');
  await expect(page.getByRole('link', { name: 'Перезагрузить страницу' })).toBeVisible();
});


test('bundled school replacements survive an unavailable Google connection and only strike the replaced subgroup', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-25T09:00:00Z'));
  await page.goto('./');
  await expect(page.locator('.coverage-note')).toHaveCount(0);
  const third = page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: /^3$/ }) });
  await expect(third.locator('.replacement h3')).toHaveText('Информатика');
  await expect(third.locator('.replacement p')).toContainText('Харисова Е.А.');
  await expect(third.locator('.crossed p')).toContainText('Путилкина Н.П.');
  const seventh = page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: /^7$/ }) });
  await expect(seventh.locator('.original').filter({ hasText: 'Вереина О.К.' })).not.toHaveClass(/crossed/);
  await expect(seventh.locator('.original').filter({ hasText: 'Саакян М.А.' })).toHaveClass(/crossed/);
  await expect(page.locator('#sync-status')).toContainText('Не удалось обновить');
  await expect(page.locator('img[alt="Герб школы"]')).toBeVisible();
  await expect.poll(() => page.locator('img[alt="Герб школы"]').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('today is distinct from missing replacement data and the latest class records are reachable', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.coverage-note')).toContainText('На 11 ноября в таблице пока нет записей замен');
  await page.locator('#last-changes').click();
  await expect(page.locator('.calendar h2')).toContainText('28 сентября');
  await expect(page.locator('.replacement').first()).toBeVisible();
});

test('unknown records remain visible and cancellation does not look like a teacher name', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00Z'));
  await page.goto('./');
  await chooseClass(page, '7А');
  await expect(page.locator('.replacement h3').filter({ hasText: 'Урок отменён' })).toBeVisible();
  await openSources(page);
  await page.locator('#import-file').setInputFiles({
    name: 'unmatched.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Дата;Класс;Урок;Предмет;Учитель;Кого заменяют\n05.11.2026;7А;;Физика;Тестовый учитель;Неизвестный А.А.\n'),
  });
  await page.locator('#close-dialog').click();
  await expect(page.locator('.unmatched')).toContainText('Номер урока не указан');
  await expect(page.locator('.crossed')).toHaveCount(0);
});

test('Google refresh reads the school schema and caches the result for a reload without network', async ({ page }) => {
  const snapshot = JSON.parse(fs.readFileSync('data/replacements.json'));
  snapshot.fetchedAt = '2026-11-10T00:00:00Z';
  await page.route(/\/(?:data\/replacements\.json|assets\/replacements-[^/]+\.json)$/, route => route.fulfill({ json: snapshot }));
  const { utils, write } = await import('../../vendor/xlsx.js');
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([
    ['Дата', 'Ф.И.О. учителя,пропустившего урок', 'Предмет', 'Класс', 'Урок', 'Кабинет', 'Ф.И.О. учителя,заменившего урок', 'Предмет'],
    ['11.11.2026', 'Шаповаленко Т.Г.', 'Физика', '9ц', '3-4', '2.40', 'Учитель из Google', 'Физика'],
  ]), 'Ноябрь');
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.fulfill({
    status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: Buffer.from(write(book, { type: 'buffer', bookType: 'xlsx' })),
  }));
  await page.goto('./');
  await expect(page.locator('#sync-status')).toContainText('Google Таблицы');
  await expect(page.locator('.replacement p').filter({ hasText: 'Учитель из Google' })).toHaveCount(2);
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#sync-status')).toContainText('Не удалось обновить');
  await expect(page.locator('.replacement p').filter({ hasText: 'Учитель из Google' })).toHaveCount(2);
});

test('month selection opens a modal calendar and date selection opens real replacements', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#month-select')).toHaveValue('2026-11');
  await selectMonth(page, '2026-09');
  await expect(page.locator('#toggle-calendar')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.month-day:not(.outside-month)')).toHaveCount(30);
  await expect(page.locator('#calendar-day-2026-09-25 .replacement-marker')).toBeVisible();
  await page.locator('#calendar-day-2026-09-25').click();
  await expect(page.locator('#month-panel')).toBeHidden();
  await expect(page.locator('.calendar h2')).toContainText('25 сентября');
  await expect(page.locator('.replacement')).toHaveCount(3);
  await expect(page.locator('.class-badge')).toHaveText('9Ц');
  await page.locator('#toggle-calendar').click();
  await page.locator('#month-prev').click();
  await expect(page.locator('#month-select')).toHaveValue('2026-08');
  await page.locator('#month-next').click();
  await expect(page.locator('#month-select')).toHaveValue('2026-09');
  await page.locator('#month-next').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#month-panel')).toBeHidden();
  await expect(page.locator('#toggle-calendar')).toBeFocused();
});

test('month and year navigation handle short months without skipping dates or losing the class', async ({ page }) => {
  await page.goto('./');
  await chooseClass(page, '11Ш');
  await selectMonth(page, '2026-01');
  await page.locator('#calendar-day-2026-01-31').click();
  await selectMonth(page, '2026-02');
  await expect(page.locator('.calendar h2')).toContainText('28 февраля');
  await expect(page.locator('.month-day:not(.outside-month)')).toHaveCount(28);
  await selectMonth(page, '2026-01');
  await page.locator('#month-prev').click();
  await expect(page.locator('#month-select')).toHaveValue('2025-12');
  await expect(page.locator('.class-badge')).toHaveText('11Ш');
  await page.locator('#close-calendar').click();
  await page.locator('#today').click();
  await expect(page.locator('#month-select')).toHaveValue('2026-11');
  await expect(page.locator('#month-panel')).toBeHidden();
  await expect(page.locator('.calendar h2')).toContainText('Сегодня');
});

test('source details list all monthly sheets and distinguish copied dates from the sheet name', async ({ page }) => {
  await page.goto('./');
  await openSources(page);
  await expect(page.locator('.sheet-reports li')).toHaveCount(3);
  await expect(page.locator('.sheet-reports')).toContainText('1-30 сентября 2026');
  await expect(page.locator('.sheet-reports')).toContainText('1-30 октября 2026');
  await expect(page.locator('.sheet-reports')).toContainText('1-30 ноября 2026');
  await expect(page.locator('.sheet-reports li').last()).toContainText('октябрь 2026');
  await expect(page.locator('.sheet-month-note')).toContainText('Учитываются даты самих записей');
});

test('phone date grid stays within the screen and empty future months do not claim replacement coverage', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('./');
  await page.locator('#toggle-calendar').click();
  await expect(page.locator('.month-weekdays span')).toHaveCount(7);
  await expect(page.locator('.month-day:not(.outside-month)')).toHaveCount(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#calendar-day-2026-11-20').click();
  await expect(page.locator('.calendar h2')).toContainText('20 ноября');
  await selectMonth(page, '2027-03');
  await expect(page.locator('.month-data-note')).toContainText('пока нет записей');
  await expect(page.locator('.month-grid .replacement-marker')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const timezone of ['Europe/Moscow', 'America/New_York', 'Asia/Kathmandu']) {
  test.describe(`Excel calendar dates in ${timezone}`, () => {
    test.use({ timezoneId: timezone });
    test('keeps the reported 6М replacement on November 5 even with historical offset seconds', async ({ page }) => {
      const { missingReplacementWorkbook } = await import('../fixtures/missing-replacement.js');
      await page.addInitScript(() => {
        const NativeDate = Date;
        // Historical timezone databases may include seconds at Excel's 1899 epoch.
        class HistoricalDate extends NativeDate {
          constructor(...args) {
            super(...args);
            if (args.length >= 3 && args[0] === 1899 && args[1] === 11 && args[2] === 30) this.setTime(this.getTime() - 17000);
          }
        }
        window.Date = HistoricalDate;
      });
      await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.fulfill({
        status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: missingReplacementWorkbook(),
      }));
      await page.goto('./');
      await expect(page.locator('#sync-status')).toContainText('Google Таблицы');
      await chooseClass(page, '6М');
      await selectMonth(page, '2026-11');
      await page.locator('#calendar-day-2026-11-05').click();
      const fourth = page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: /^4$/ }) });
      await expect(fourth.locator('.replacement p')).toContainText('Шурухина О.С. · Каб. 2.24');
      await expect(fourth.locator('.crossed p')).toContainText('Попова Ю.Н.');
      await expect(page.locator('.coverage-note')).toHaveCount(0);
      const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('school-replacements-v3')));
      expect(cache.coverage).toEqual(['2026-11-05']);
      expect(cache.entries[0].date).toBe('2026-11-05');
      await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
      await page.reload();
      await selectMonth(page, '2026-11');
      await page.locator('#calendar-day-2026-11-05').click();
      await expect(page.locator('.replacement p')).toContainText('Шурухина О.С.');
      await page.locator('#prev').click();
      await expect(page.locator('.replacement')).toHaveCount(0);
    });
  });
}

test('a newer legacy cache with shifted dates cannot hide the correct bundled replacement', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  const previous = JSON.parse(fs.readFileSync('data/replacements.json'));
  previous.version = 2;
  previous.origin = 'file';
  previous.fetchedAt = '2099-01-01T00:00:00Z';
  previous.coverage = ['2026-11-04'];
  previous.entries = previous.entries.filter(row => row.className === '6М' && row.date === '2026-11-05').map(row => ({ ...row, date: '2026-11-04' }));
  previous.unresolved = [];
  await page.addInitScript(previous => {
    localStorage.setItem('school-replacements-v2', JSON.stringify(previous));
    localStorage.setItem('school-class', JSON.stringify('6М'));
  }, previous);
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await selectMonth(page, '2026-11');
  await page.locator('#calendar-day-2026-11-05').click();
  await expect(page.locator('.replacement p')).toContainText('Шурухина О.С. · Каб. 2.24');
  await expect(page.locator('.coverage-note')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school-replacements-v2')))).toEqual(previous);
});
