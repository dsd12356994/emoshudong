import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
const errors = [];
async function setup(options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    ),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base);
  await expect(page.locator("#garden-cat")).toHaveAttribute(
    "data-state",
    "idle",
  );
  return { page, context, cat: page.locator("#garden-cat") };
}
async function grab(page, cat) {
  const r = await cat.boundingBox();
  await page.mouse.move(r.x + 40, r.y + 40);
  await page.mouse.down();
  await expect(cat).toHaveAttribute("data-state", "dragging");
}
try {
  const { page, context, cat } = await setup({
    viewport: { width: 1440, height: 1000 },
  });
  await page.mouse.move(1050, 590);
  await expect(cat).toHaveAttribute("data-state", "running");
  const frame = await cat.getAttribute("data-frame");
  await expect.poll(() => cat.getAttribute("data-frame")).not.toBe(frame);
  await expect(cat).toHaveAttribute("data-state", "idle");
  assert.equal(await cat.getAttribute("data-frame"), "6");
  await grab(page, cat);
  const before = await cat.boundingBox();
  await page.mouse.move(800, 650, { steps: 5 });
  await expect
    .poll(async () => Math.abs((await cat.boundingBox()).x - before.x))
    .toBeGreaterThan(70);
  assert.equal(await cat.getAttribute("data-frame"), "7");
  await page.screenshot({ path: "test-results/cat-dragging.png" });
  await page.mouse.up();
  await expect(cat).toHaveAttribute("data-state", "idle");
  assert.equal(await page.locator("#letter-dialog").isVisible(), false);
  await grab(page, cat);
  const door = await page.locator("#tree-door").boundingBox();
  await page.mouse.move(door.x + door.width / 2, door.y + door.height / 2, {
    steps: 12,
  });
  await expect(page.locator("#tree-door")).toHaveClass(/drop-ready/);
  await page.mouse.up();
  await expect(page.locator("#letter-dialog")).toBeVisible();
  await expect(cat).toBeHidden();
  await page.locator('[data-close="letter-dialog"]').click();
  await expect(cat).toBeVisible();
  await page.locator("#tree-door").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#letter-dialog")).toBeVisible();
  await page.locator('[data-close="letter-dialog"]').click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(700, 500);
  await expect(cat).toHaveAttribute("data-state", "idle");
  await expect(cat).toHaveAttribute("data-frame", "6");
  await context.close();
  const mobile = await setup({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const r = await mobile.cat.boundingBox();
  const caption = await mobile.page.locator(".garden-caption").boundingBox();
  assert.ok(
    r.y + r.height <= caption.y + 10,
    "cat should start above mobile caption",
  );
  const cdp = await mobile.context.newCDPSession(mobile.page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: r.x + 40, y: r.y + 40, id: 1 }],
  });
  await expect(mobile.cat).toHaveAttribute("data-state", "dragging");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 90, y: 260, id: 1 }],
  });
  await expect
    .poll(async () => (await mobile.cat.boundingBox()).y)
    .toBeLessThan(r.y - 60);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(mobile.cat).toHaveAttribute("data-state", "idle");
  const mobileDoor = await mobile.page.locator("#tree-door").boundingBox();
  await mobile.page.touchscreen.tap(
    mobileDoor.x + mobileDoor.width / 2,
    mobileDoor.y + mobileDoor.height / 2,
  );
  await expect(mobile.page.locator("#letter-dialog")).toBeVisible();
  await mobile.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "Garden checks passed: running frames, idle, mouse drag, drop into hollow, keyboard entry, reduced motion, touch drag/cancel and tap entry.",
  );
} finally {
  await browser.close();
}
