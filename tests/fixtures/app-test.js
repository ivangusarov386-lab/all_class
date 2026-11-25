import { test as base, expect } from '@playwright/test';

// Existing feature suites run as a user who explicitly chose no entry password.
// The entry-lock suite separately exercises first use, protection and settings.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem('all-class-entry-lock-v1') === null) localStorage.setItem('all-class-entry-lock-v1', JSON.stringify({ version: 1, mode: 'none' }));
      } catch {}
    });
    await use(page);
  },
});
export { expect };
