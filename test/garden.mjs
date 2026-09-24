import { chromium, expect } from "@playwright/test";
import { dismissArrival } from "./arrival-helper.mjs";
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
  await dismissArrival(page);
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
async function checkSlowFollowing() {
  const { page, context, cat } = await setup({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    for (const speed of [120, 30]) {
      const directions = [];
      for (const direction of [1, -1]) {
        const start = direction === 1 ? 650 : 1000;
        await page.mouse.move(start, 450);
        await page.clock.runFor(2500);
        const samples = [];
        for (let i = 1; i <= 120; i++) {
          // Real pointer events preserve hit testing against the moving cat.
          await page.mouse.move(start + direction * speed * i * 0.016, 450);
          await page.clock.runFor(16);
          if (i > 30) {
            samples.push(
              await cat.evaluate((el) => ({
                x: el.getBoundingClientRect().x,
                state: el.dataset.state,
                frame: el.dataset.frame,
              })),
            );
          }
        }
        assert.ok(
          samples.every((s) => s.state === "running"),
          `${speed}px/s in direction ${direction}: continuous movement must not brake on hover`,
        );
        assert.ok(
          samples
            .slice(1)
            .every((s, i) => (s.x - samples[i].x) * direction > 0),
          "slow following should advance every frame in either direction",
        );
        assert.ok(
          new Set(samples.map((s) => s.frame)).size >= 3,
          "paws should keep stepping",
        );
        directions.push({
          travel: Math.abs(samples.at(-1).x - samples[0].x),
          // Compare the actual rendered sprite to its horizontal reflection.
          sprite: await cat.evaluate((el) =>
            Array.from(
              el
                .querySelector("canvas")
                .getContext("2d")
                .getImageData(0, 0, 128, 128).data,
            ),
          ),
        });
      }
      assert.ok(
        Math.abs(directions[0].travel - directions[1].travel) < 1,
        "left and right should follow equally smoothly",
      );
      const right = directions[0].sprite,
        left = directions[1].sprite;
      let mirroredDifference = 0;
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++)
          for (let channel = 0; channel < 4; channel++)
            mirroredDifference += Math.abs(
              left[(y * 128 + x) * 4 + channel] -
                right[(y * 128 + 127 - x) * 4 + channel],
            );
      // Canvas color rounding can differ by a channel value after reflection.
      assert.ok(
        mirroredDifference / left.length < 1,
        "the cat should face its travel direction even at slow speed",
      );
    }
  } finally {
    await context.close();
  }
}
try {
  await checkSlowFollowing();
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
    "Garden checks passed: symmetric slow following and facing, running frames, idle, mouse drag, drop into hollow, keyboard entry, reduced motion, touch drag/cancel and tap entry.",
  );
} finally {
  await browser.close();
}
