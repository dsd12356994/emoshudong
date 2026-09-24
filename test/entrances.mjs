import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    ),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page.locator("#garden-cat")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  for (const [target, dialog] of [
    ["#cottage-door", "#cottage-dialog"],
    ["#cottage-door .place-label", "#cottage-dialog"],
    ["#board-open", "#board-dialog"],
    ["#tree-door", "#letter-dialog"],
  ]) {
    const r = await page.locator(target).boundingBox();
    const x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    // Approach slowly from the right: the following cat used to cover the
    // entrance. Raw clicks reproduce this; locator.click silently retries it.
    await page.mouse.move(x + 100, y);
    await page.clock.runFor(2000);
    for (let i = 1; i <= 50; i++) {
      await page.mouse.move(x + 100 - i * 2, y);
      await page.clock.runFor(16);
    }
    const cat = await page.locator("#garden-cat").boundingBox();
    // Even where the cat overlaps the entrance, the entrance takes the click.
    if (
      x >= cat.x &&
      x <= cat.x + cat.width &&
      y >= cat.y &&
      y <= cat.y + cat.height
    )
      assert.notEqual(
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, {
          x,
          y,
        }),
        "garden-cat",
        `${target} must receive the click through the cat`,
      );
    await page.mouse.down();
    await page.mouse.up();
    await page.clock.runFor(500);
    assert.equal(
      await page.locator(dialog).isVisible(),
      true,
      `${target} should open on the first click with the cat nearby`,
    );
    await page.evaluate(
      (selector) => document.querySelector(selector).close(),
      dialog,
    );
    await page.clock.runFor(50);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Entrance checks passed: natural leftward approach, first-click entry through nearby cat, door label, board and tree hollow.",
  );
} finally {
  await browser.close();
}
