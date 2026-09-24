import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { dismissArrival } from "./arrival-helper.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    ),
  );
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:3180");
  await dismissArrival(page);
  await page.locator("#cottage-door").click();
  await expect(page.locator("#cottage-dialog")).toBeVisible();
  await expect(page.locator("#room-cat")).toHaveAttribute(
    "data-frame",
    /^[0-3]$/,
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const pixels = () =>
    page
      .locator("#resting-cat")
      .evaluate((el) =>
        Array.from(el.getContext("2d").getImageData(0, 0, 256, 256).data),
      );
  let restingTail;
  for (const part of ["head", "tail"]) {
    await page.locator(`[data-pet="${part}"]`).click();
    await expect(page.locator("#room-cat")).toHaveAttribute(
      "data-reaction",
      part,
    );
    const before = await pixels();
    if (part === "tail") restingTail = before;
    let elapsed = 0;
    for (const time of [200, 380, 620, 820, 1080, 1280]) {
      await page.clock.runFor(time - elapsed);
      elapsed = time;
      const during = await pixels();
      let changed = 0,
        outside = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const i = (y * 256 + x) * 4;
          if (before.slice(i, i + 4).some((n, c) => n !== during[i + c])) {
            changed++;
            const inside =
              part === "head"
                ? (x >= 8 && x < 79 && y >= 58 && y < 130) ||
                  (x >= 88 && x < 165 && y >= 58 && y < 132)
                : x >= 196 && y >= 122 && y < 220;
            if (!inside) outside++;
            if (part === "tail") {
              // Landmarks on the haunch, belly outline and tail root. These were
              // incorrectly included by the old rectangular "tail" region.
              const onBody =
                (x >= 196 && x <= 209 && y >= 134 && y <= 154) ||
                (x >= 203 && x <= 215 && y >= 157 && y <= 167) ||
                (x >= 205 && x <= 217 && y >= 172 && y <= 182) ||
                (x >= 193 && x <= 211 && y >= 190 && y <= 206);
              assert.equal(
                onBody,
                false,
                `tail moved body pixel ${x},${y} at ${time} ms`,
              );
            }
          }
        }
      assert.ok(changed > 80, `${part} should visibly move`);
      assert.equal(
        outside,
        0,
        `${part} reaction should keep the rest of the body still`,
      );
      assert.equal(
        await page
          .locator("#resting-cat")
          .evaluate((el) => getComputedStyle(el).transform),
        "none",
      );
    }
    await page.clock.runFor(1580 - elapsed);
    assert.deepEqual(
      await pixels(),
      before,
      "local motion should return smoothly to the original sprite",
    );
    await page.clock.runFor(800);
  }
  // A second stroke while the first is still moving must start from the clean
  // sprite, not accumulate another deformation onto the already bent tail.
  const tail = page.locator('[data-pet="tail"]');
  await tail.click();
  await page.clock.runFor(800);
  await tail.click();
  assert.deepEqual(await pixels(), restingTail);
  await page.clock.runFor(380);
  assert.notDeepEqual(await pixels(), restingTail);
  await page.clock.runFor(1200);
  assert.deepEqual(await pixels(), restingTail);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const part of ["head", "tail"]) {
    await page.locator(`[data-pet="${part}"]`).click();
    const still = await pixels();
    await page.clock.runFor(600);
    assert.deepEqual(await pixels(), still);
    await page.clock.runFor(1800);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Pet detail checks passed: six animation phases, fixed belly and tail root, repeat strokes, return to rest and reduced motion.",
  );
} finally {
  await browser.close();
}
