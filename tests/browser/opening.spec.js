import { test, expect } from '@playwright/test';
import { rememberTestClass, chooseClass } from '../fixtures/class-profile.js';

const googleExport = 'https://docs.google.com/spreadsheets/d/**/export?format=xlsx';
test.use({ reducedMotion: 'no-preference' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-13T09:00:00Z'));
  await page.route(googleExport, route => route.abort('internetdisconnected'));
});

test('a new visit plays the inline muted intro before class choice and Skip opens the app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const responses = [];
  page.on('response', response => { if (/opening[^/]*\.mp4/.test(response.url())) responses.push(response); });
  await page.goto('./');
  await expect(page.locator('#opening-intro')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#class-dialog')).toHaveCount(0);
  await expect(page.locator('#opening-video')).toHaveJSProperty('muted', true);
  await expect(page.locator('#opening-video')).toHaveJSProperty('playsInline', true);
  await expect.poll(() => page.locator('#opening-video').evaluate(video => video.currentTime)).toBeGreaterThan(0.05);
  expect(responses.length).toBeGreaterThan(0);
  expect(responses[0].headers()['content-type']).toContain('video/mp4');
  expect([200, 206]).toContain(responses[0].status());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Пропустить анимацию' }).click();
  await expect(page.locator('#opening-intro')).toHaveCount(0);
  await expect(page.locator('#class-dialog')).toBeVisible();
  await chooseClass(page, '6М');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#lesson-note-2')).toBeVisible();
});

test('the full real video finishes naturally and restores the saved class', async ({ page, baseURL }) => {
  test.setTimeout(25000);
  await rememberTestClass(page, baseURL, '6М');
  await page.goto('./');
  await expect(page.locator('#opening-intro')).toBeVisible();
  await expect.poll(() => page.locator('#opening-video').evaluate(video => video.currentTime)).toBeGreaterThan(0.05);
  await page.locator('#opening-video').evaluate(video => video.addEventListener('ended', () => { window.introFinishedNaturally = true; }));
  await expect(page.locator('#opening-intro')).toHaveCount(0, { timeout: 15000 });
  expect(await page.evaluate(() => window.introFinishedNaturally)).toBe(true);
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#class-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('has-opening'))).toBe(false);
});

test('Escape skips the animation using only the keyboard', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.goto('./');
  await expect(page.locator('#skip-opening')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#opening-intro')).toHaveCount(0);
  await expect(page.locator('.class-badge')).toHaveText('6М');
});

test('an unavailable clip or blocked autoplay cannot stop the timetable', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.route('**/opening*.mp4', route => route.abort('internetdisconnected'));
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#opening-intro')).toHaveCount(0);
  await page.unroute('**/opening*.mp4');
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')); });
  await page.reload();
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#opening-intro')).toHaveCount(0);
});

test('a video that never begins playback is skipped automatically', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() { this.autoplay = false; this.removeAttribute('autoplay'); return new Promise(() => {}); };
  });
  await page.goto('./');
  await expect(page.locator('#opening-intro')).toBeVisible();
  await expect(page.locator('.class-badge')).toHaveText('6М', { timeout: 6000 });
  await expect(page.locator('#opening-intro')).toHaveCount(0);
});

test('reduced motion opens the app without downloading the video', async ({ page, baseURL }) => {
  await rememberTestClass(page, baseURL, '6М');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const media = [];
  page.on('request', request => { if (/opening[^/]*\.mp4/.test(request.url())) media.push(request.url()); });
  await page.goto('./');
  await expect(page.locator('.class-badge')).toHaveText('6М');
  await expect(page.locator('#opening-intro')).toHaveCount(0);
  expect(media).toEqual([]);
});

test('a failed app module dismisses the intro and keeps the startup error visible', async ({ page }) => {
  await page.route(/\/(?:src\/main\.js|assets\/main-[^/]+\.js)(?:\?.*)?$/, route => route.abort('internetdisconnected'));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('Не удалось открыть расписание');
  await expect(page.locator('#opening-intro')).toHaveCount(0);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Перезагрузить страницу' })).toBeVisible();
});
