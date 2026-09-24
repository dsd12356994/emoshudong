import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
const dir = mkdtempSync(join(tmpdir(), "treehole-arrival-test-"));
const server = createApp({ env: {}, dataDir: dir });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
mkdirSync("test-results", { recursive: true });
async function setup({ first = false, mobile = false } = {}) {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  if (!first)
    await page.addInitScript(() =>
      localStorage.setItem(
        "huisheng-garden",
        JSON.stringify({ color: "#f4dab0", motion: true }),
      ),
    );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page.locator("#account-dialog")).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  return page;
}
async function notice(page) {
  await expect(page.locator("#announcement-dialog")).toBeVisible();
}
try {
  for (const action of ["close", "escape", "guest"]) {
    const page = await setup();
    assert.equal(await page.locator("#announcement-dialog").isVisible(), false);
    assert.equal(await page.locator("#cat-dialog").isVisible(), false);
    if (action === "close")
      await page.locator('[data-close="account-dialog"]').click();
    if (action === "escape") await page.keyboard.press("Escape");
    if (action === "guest") await page.locator("#account-guest").click();
    await notice(page);
    await page.clock.runFor(4900);
    await notice(page);
    await page.clock.runFor(150);
    await expect(page.locator("#announcement-dialog")).toBeHidden();
    await expect(page.locator("#funding-dialog")).toBeVisible();
    if (action === "escape") await page.keyboard.press("Escape");
    else if (action === "close")
      await page.locator('[data-close="funding-dialog"]').first().click();
    else await page.locator("#funding-continue").click();
    await page.locator("#tree-door").click();
    await page.clock.runFor(300);
    await expect(page.locator("#chat-consent-dialog")).toBeVisible();
    await expect(page.locator("#letter-dialog")).toBeHidden();
    await page.close();
  }
  const paused = await setup();
  await paused.locator("#account-guest").click();
  await notice(paused);
  await paused.clock.runFor(1200);
  await paused.locator("#announcement-hold").click();
  await paused.clock.runFor(6000);
  await notice(paused);
  await expect(paused.locator("#announcement-countdown")).toContainText(
    "已暂停",
  );
  await paused.screenshot({ path: "test-results/announcement-desktop.png" });
  await paused.locator("#announcement-hold").click();
  await paused.locator("#announcement-privacy").click();
  await paused.clock.runFor(6000);
  await expect(paused.locator("#privacy-dialog")).toBeVisible();
  await paused.locator("#privacy-dialog [data-close]").first().click();
  await paused.clock.runFor(3600);
  await notice(paused);
  await paused.clock.runFor(250);
  await expect(paused.locator("#announcement-dialog")).toBeHidden();
  await paused.locator("#funding-continue").click();
  await paused.locator("#guide-open").click();
  await paused.locator("#announcement-replay").click();
  await notice(paused);
  await expect(paused.locator("#guide-dialog")).toBeHidden();
  await paused.clock.runFor(5100);
  await expect(paused.locator("#announcement-dialog")).toBeHidden();
  await paused.close();

  const member = await setup({ first: true });
  await member.locator("#register-tab").click();
  await member.locator("#account-nickname").fill("入院测试小猫");
  await member.locator("#account-password").fill("arrival-test-password");
  await member.locator("#account-submit").click();
  await notice(member);
  await expect(member.locator("#cat-dialog")).toBeHidden();
  await member.clock.runFor(5100);
  await expect(member.locator("#cat-dialog")).toBeHidden();
  await expect(member.locator("#funding-dialog")).toBeVisible();
  await member.locator("#funding-api-open").click();
  await expect(member.locator("#model-dialog")).toBeVisible();
  await member.locator('[data-close="model-dialog"]').first().click();
  await expect(member.locator("#cat-dialog")).toBeHidden();
  await member.locator("#funding-continue").click();
  await expect(member.locator("#cat-dialog")).toBeVisible();
  await member.locator("#cat-form button[type=submit]").click();
  await member.reload();
  await expect(member.locator("#account-returning")).toBeVisible();
  await expect(member.locator("#account-welcome")).toContainText(
    "入院测试小猫",
  );
  await member.locator("#account-continue").click();
  await notice(member);
  await member.locator("#announcement-close").click();
  await expect(member.locator("#cat-dialog")).toBeHidden();
  await member.reload();
  await expect(member.locator("#account-returning")).toBeVisible();
  await member.locator("#account-guest").click();
  await notice(member);
  assert.ok(
    !(await member.context().cookies()).some(
      (c) => c.name === "garden_session",
    ),
  );
  await member.reload();
  await member.locator("#account-nickname").fill("入院测试小猫");
  await member.locator("#account-password").fill("arrival-test-password");
  await member.locator("#account-submit").click();
  await notice(member);
  await member.locator("#announcement-close").click();
  await member.locator("#funding-continue").click();
  await member.locator("#tree-door").click();
  await member.clock.runFor(300);
  await expect(member.locator("#chat-consent-dialog")).toBeVisible();
  await expect(member.locator("#letter-dialog")).toBeHidden();
  await member.reload();
  await expect(member.locator("#account-returning")).toBeVisible();
  await member.route("**/api/account/logout", (route) => route.abort());
  await member.locator("#account-guest").click();
  await expect(member.locator("#account-welcome")).toContainText(
    "暂时无法切换游客",
  );
  await member.locator('[data-close="account-dialog"]').click();
  await notice(member);
  await member.close();

  const mobile = await setup({ mobile: true });
  await mobile.screenshot({ path: "test-results/login-mobile.png" });
  await mobile.locator("#account-guest").tap();
  await notice(mobile);
  await mobile.locator("#announcement-hold").tap();
  await mobile.screenshot({ path: "test-results/announcement-mobile.png" });
  const bounds = await mobile.locator("#announcement-dialog").boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y + bounds.height <= 844,
  );
  const footer = await mobile.locator(".announcement-footer").boundingBox();
  assert.ok(footer.y + footer.height <= 844);
  await mobile
    .locator(".announcement-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(mobile.locator(".announcement-consent")).toBeInViewport();
  await mobile.clock.runFor(6000);
  await notice(mobile);
  await mobile.locator("#announcement-close").tap();
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "Arrival checks passed: close/Escape/guest/register/login/remembered session, one dialog at a time, five visible seconds, reading pause, privacy pause, guide replay, no auto-consent and mobile layout.",
  );
} finally {
  await browser.close();
  await new Promise((r) => {
    server.close(r);
    server.closeAllConnections();
  });
  rmSync(dir, { recursive: true, force: true });
}
