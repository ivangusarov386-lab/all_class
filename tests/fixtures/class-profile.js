import { expect } from '@playwright/test';
import { CLASS_COOKIE_NAME } from '../../src/profile.js';

export async function rememberTestClass(page, baseURL, className = '9Ц') {
  const url = new URL(baseURL);
  await page.context().addCookies([{
    name: CLASS_COOKIE_NAME, value: encodeURIComponent(className),
    domain: url.hostname, path: new URL('./', url).pathname,
    sameSite: 'Lax', secure: url.protocol === 'https:',
    expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }]);
}

export async function chooseClass(page, className) {
  await expect(page.locator('#reset-class, #class-dialog')).toBeVisible();
  const reset = page.locator('#reset-class');
  if (await reset.count()) await reset.click();
  await page.selectOption('#grade', String(parseInt(className)));
  await page.selectOption('#class-select', className);
  await page.locator('#open-schedule').click();
  await expect(page.locator('.class-badge')).toHaveText(className);
}
