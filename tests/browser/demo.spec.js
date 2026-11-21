import { test, expect } from '@playwright/test';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';

test.beforeEach(async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '9Ц');
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00Z'));
  await page.route('https://docs.google.com/spreadsheets/d/**/export?format=xlsx', route => route.abort('internetdisconnected'));
});

test('9Ц has two blue МЦКО cards and two green СтатГрад cards on November 20 only', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.gto-banner')).toBeVisible();
  await expect(page.locator('.change-tag')).toHaveText('4 изменения');
  await expect(page.locator('.event-mcko')).toHaveCount(2);
  await expect(page.locator('.event-statgrad')).toHaveCount(2);
  await expect(page.locator('.event-mcko').first().locator('.replacement p')).toHaveText('Кабинет 2.41');
  await expect(page.locator('.event-mcko').first()).toHaveCSS('border-left-color', 'rgb(37, 99, 235)');
  await expect(page.locator('.event-statgrad').first()).toHaveCSS('border-left-color', 'rgb(21, 128, 61)');
  await expect(page.locator('.event-mcko').first()).toHaveCSS('background-image', /rgb\(191, 219, 254\)/);
  await expect(page.locator('.event-statgrad').first()).toHaveCSS('background-image', /rgb\(187, 247, 208\)/);
  await expect(page.locator('.event-card .original, .event-card .crossed')).toHaveCount(0);
  await expect(page.locator('.event-mcko').first()).not.toContainText('Белова С.В.');
  await expect(page.locator('.event-statgrad').first()).not.toContainText('Путилкина Н.П.');
  await expect(page.locator('.event-statgrad').first()).not.toContainText('Харисова Е.А.');
  const third = page.locator('.lesson').filter({ has: page.locator('.lesson-number', { hasText: /^3$/ }) });
  await expect(third.locator('.original')).toHaveCount(2);
  await expect(page.locator('[id^="lesson-note-"]')).toHaveCount(7);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('#toggle-calendar').click();
  await expect(page.locator('#calendar-day-2026-11-20')).toHaveAttribute('aria-label', /4 замены/);
  await page.locator('#close-calendar').click();
  await page.locator('#prev').click();
  await expect(page.locator('.demo-replacement')).toHaveCount(0);
  await page.locator('#next').click();
  await expect(page.locator('.demo-replacement')).toHaveCount(4);
});

test('other classes keep their original layout without demo events or the GTO banner', async ({ page }) => {
  await page.goto('./');
  for (const name of ['9А', '10Я', '6М']) {
    await chooseClass(page, name);
    await expect(page.locator('.demo-badge, .gto-banner, .event-card, .demo-replacement')).toHaveCount(0);
  }
});

test('a real 9Ц replacement is red and contains the substitute without the replaced teacher', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-21T09:00:00Z'));
  await page.goto('./');
  const card = page.locator('.event-replacement').filter({ hasText: 'Шляпугина Т.А.' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.replacement-label')).toHaveText('Замена');
  await expect(card.locator('.replacement p')).toHaveText('Шляпугина Т.А.');
  await expect(card).not.toContainText('Науменко И.М.');
  await expect(card).toHaveCSS('border-left-color', 'rgb(220, 38, 38)');
  await expect(card).toHaveCSS('background-image', /rgb\(254, 202, 202\)/);
});
