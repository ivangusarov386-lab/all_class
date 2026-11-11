import { expect } from '@playwright/test';

export async function selectMonth(page, month) {
  const inDialog = await page.locator('#calendar-dialog').isVisible();
  await page.selectOption(inDialog ? '#calendar-month' : '#month-select', month);
  await expect(page.locator('#calendar-dialog')).toBeVisible();
  await expect(page.locator('#calendar-month')).toHaveValue(month);
}

export async function openSources(page) {
  await page.locator('#details').click();
  if (await page.locator('#access-dialog').isVisible()) {
    await page.locator('#source-password').fill('548.8');
    await page.locator('#access-form').getByRole('button', { name: 'Открыть настройки' }).click();
  }
  await expect(page.locator('#source-dialog')).toBeVisible();
}
