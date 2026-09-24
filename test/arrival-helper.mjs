import { expect } from "@playwright/test";

// Exercise the real guest path before the focused interaction checks.
export async function dismissArrival(page) {
  await expect(page.locator("#account-dialog")).toBeVisible();
  await page.locator("#account-guest").click();
  await expect(page.locator("#announcement-dialog")).toBeVisible();
  await page.locator("#announcement-close").click();
  await expect(page.locator("#announcement-dialog")).toBeHidden();
}
