import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00Z'));
});

test('opens under the repository path with no build server or external dependencies', async ({ page }) => {
  const errors = [], responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => responses.push(response));
  await page.goto('./');
  await expect(page.locator('.class-button.active')).toHaveText('9Ц');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await expect(page.locator('.calendar h2')).toContainText('Сегодня');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe('none');
  expect(errors).toEqual([]);
  expect(responses.filter(response => response.status() >= 400).map(response => response.url())).toEqual([]);
  expect(responses.every(response => new URL(response.url()).hostname === '127.0.0.1')).toBe(true);
  expect(responses.some(response => /xlsx.*\.(js|mjs)/.test(response.url()))).toBe(false);

  await page.selectOption('#grade', '5');
  await page.locator('[data-class="5А"]').click();
  await page.reload();
  await expect(page.locator('.class-button.active')).toHaveText('5А');
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
  await page.locator('#settings').click();
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
  await page.locator('#settings').click();
  await page.locator('#clear').click();
  await expect(page.locator('.replacement')).toHaveCount(0);
});

test('works on a narrow phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.lesson').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.selectOption('#grade', '11');
  await page.locator('[data-class="11Я"]').click();
  await expect(page.locator('.class-button.active')).toHaveText('11Я');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('shows a useful message if the app module fails to load', async ({ page }) => {
  await page.route(/\/(?:src\/main\.js|assets\/main-[^/]+\.js)$/, route => route.abort());
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть расписание');
  await expect(page.getByRole('link', { name: 'Перезагрузить страницу' })).toBeVisible();
});
