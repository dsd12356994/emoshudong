import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";

const dir = mkdtempSync(join(tmpdir(), "treehole-cottage-browser-"));
let timeOffset = 0;
const server = createApp({
  env: {},
  dataDir: dir,
  now: () => Date.now() + timeOffset,
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
mkdirSync("test-results", { recursive: true });
async function pageFor(options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    if (!localStorage.getItem("huisheng-garden"))
      localStorage.setItem(
        "huisheng-garden",
        JSON.stringify({ color: "#f4dab0", motion: true }),
      );
    if (!localStorage.getItem("huisheng-pet"))
      localStorage.setItem(
        "huisheng-pet",
        JSON.stringify({
          version: 1,
          mood: 15,
          activity: 65,
          updatedAt: Date.now(),
          fedDay: "",
        }),
      );
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base);
  return { context, page };
}
try {
  const { page, context } = await pageFor({
    viewport: { width: 1440, height: 1000 },
  });
  await page.locator("#cottage-door").click();
  await expect(page.locator("#cottage-dialog")).toBeVisible();
  await expect(page.locator("#garden-cat")).toBeHidden();
  await expect(page.locator("#room-cat")).toHaveAttribute(
    "data-expression",
    "sad",
  );
  await expect(page.locator("#room-cat")).toHaveAttribute("data-frame", "2");
  assert.match(
    await page
      .locator("#cottage-dialog")
      .evaluate((e) => getComputedStyle(e).cursor),
    /glove.svg/,
  );
  await page.screenshot({ path: "test-results/room-before.png" });
  const mood = await page.locator("#mood-meter").evaluate((e) => e.value);
  for (const part of ["head", "belly", "paw", "tail"]) {
    await page.locator(`[data-pet="${part}"]`).click();
    await expect(page.locator("#room-cat")).toHaveAttribute(
      "data-reaction",
      part,
    );
    await expect(page.locator("#room-cat")).toHaveAttribute("data-frame", "1");
    await page.waitForTimeout(800);
  }
  assert.ok(
    (await page.locator("#mood-meter").evaluate((e) => e.value)) > mood + 20,
  );
  await page.locator("#feed-cat").click();
  await expect(page.locator("#hunger-label")).toHaveText("饱饱的");
  await expect(page.locator("#feed-cat")).toBeDisabled();
  await page.screenshot({ path: "test-results/room-desktop.png" });
  await page.reload();
  await page.locator("#cottage-door").click();
  await expect(page.locator("#feed-cat")).toBeDisabled();
  timeOffset = 86400000;
  await page.locator('[data-close="cottage-dialog"]').click();
  await page.locator("#cottage-door").click();
  await expect(page.locator("#feed-cat")).toBeEnabled();
  await expect(page.locator("#hunger-label")).toHaveText("半饿");
  await expect(page.locator("#room-cat")).toHaveAttribute(
    "data-expression",
    "sleepy",
  );
  await page.locator('[data-close="cottage-dialog"]').click();
  const activity = await page.evaluate(
    () => JSON.parse(localStorage.getItem("huisheng-pet")).activity,
  );
  await page.mouse.move(1050, 500);
  await expect(page.locator("#garden-cat")).toHaveAttribute(
    "data-state",
    "running",
  );
  await expect(page.locator("#garden-cat")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await page.locator("#cottage-door").click();
  await expect(page.locator("#cottage-dialog")).toBeVisible();
  await expect
    .poll(() => page.locator("#activity-meter").evaluate((e) => e.value))
    .toBeGreaterThan(activity);
  await page.locator('[data-close="cottage-dialog"]').click();
  await page.locator("#board-open").click();
  await expect(page.locator("#board-posts")).toContainText("白板刚刚擦干净");
  await page.locator("#account-open").click();
  await page.locator("#account-nickname").fill("浏览器小猫");
  await page.locator("#account-password").fill("browser-test-password");
  await page.locator("#account-submit").click();
  await expect(page.locator("#account-dialog")).toBeHidden();
  await expect(page.locator("#account-label")).toContainText("浏览器小猫");
  const unsafe = '<img src=x onerror="alert(1)"> 今天也要开心';
  await page.locator("#board-message").fill(unsafe);
  await page.locator("#board-send").click();
  await expect(page.locator(".board-post p")).toHaveText(unsafe);
  assert.equal(await page.locator(".board-post img").count(), 0);
  await expect(page.locator(".board-post footer")).toContainText("路过的小猫");
  timeOffset += 16000;
  await page
    .locator("#board-message")
    .fill("在这里，慢慢长成自己喜欢的样子。愿路过的人都有一个轻松的夜晚。 ");
  await page.locator("#board-anonymous").uncheck();
  await page.locator("#board-send").click();
  await expect(page.locator(".board-post")).toHaveCount(2);
  await expect(page.locator(".board-post").last()).toContainText("浏览器小猫");
  await page.screenshot({ path: "test-results/board-desktop.png" });
  await page
    .locator(".board-post")
    .first()
    .getByRole("button", { name: "收回" })
    .click();
  await expect(page.locator(".board-post")).toHaveCount(1);
  await page.locator("#account-logout").click();
  await expect(page.locator("#account-open")).toBeVisible();
  await page.locator("#account-open").click();
  await page.locator("#login-tab").click();
  await page.locator("#account-password").fill("browser-test-password");
  await page.locator("#account-submit").click();
  await expect(page.locator("#account-dialog")).toBeHidden();
  await expect(page.locator("#account-label")).toContainText("浏览器小猫");
  timeOffset += 86400000;
  await page.locator("#board-refresh").click();
  await expect(page.locator(".board-post")).toHaveCount(0);
  await page.locator('[data-close="board-dialog"]').click();
  await page.locator("#guide-open").click();
  await expect(page.locator("#guide-dialog")).toContainText(
    "不会生病、死亡或离开",
  );
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#cottage-door").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#cottage-dialog")).toBeVisible();
  await page.locator('[data-pet="paw"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#room-cat")).toHaveAttribute(
    "data-reaction",
    "paw",
  );
  assert.equal(
    await page
      .locator("#resting-cat")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/garden-places.png" });
  await context.close();
  timeOffset = 0;
  const mobile = await pageFor({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobile.page.locator("#cottage-shortcut").tap();
  await expect(mobile.page.locator("#cottage-dialog")).toBeVisible();
  await mobile.page.locator("#room-note-close").tap();
  await mobile.page.locator('[data-pet="head"]').tap();
  await expect(mobile.page.locator("#room-cat")).toHaveAttribute(
    "data-reaction",
    "head",
  );
  await mobile.page.locator("#feed-cat").tap();
  await expect(mobile.page.locator("#feed-cat")).toBeDisabled();
  await mobile.page.screenshot({ path: "test-results/room-mobile.png" });
  await mobile.page.locator('[data-close="cottage-dialog"]').tap();
  await mobile.page.locator("#board-shortcut").tap();
  await mobile.page.screenshot({ path: "test-results/board-mobile.png" });
  assert.ok(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const board = await mobile.page.locator("#board-dialog").boundingBox();
  assert.ok(board.width <= 390 && board.x >= 0);
  await mobile.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "Cottage and board browser checks passed: door, glove, four reactions, pet persistence, food rollover, sleep/play, accounts, anonymous/named posts, safe rendering, deletion, daily reset, guide and mobile touch.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  rmSync(dir, { recursive: true, force: true });
}
