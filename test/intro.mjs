import { chromium, expect } from "@playwright/test";
import { dismissArrival } from "./arrival-helper.mjs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await dismissArrival(page);
  await expect(page.locator("#cat-dialog")).toBeVisible();
  // The card must not use up its visible reading time behind the first dialog.
  await page.waitForTimeout(5200);
  await expect(page.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "waiting",
  );
  await page.locator("#cat-form button[type=submit]").click();
  await page.waitForTimeout(4700);
  await expect(page.locator("#intro-card")).toBeVisible();
  await expect(page.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "waiting",
  );
  await page.locator("#intro-paper").waitFor();
  await page.evaluate(() =>
    document
      .getElementById("intro-paper")
      .getAnimations({ subtree: true })
      .forEach((a) => {
        a.pause();
        a.currentTime = 380;
      }),
  );
  await page.screenshot({ path: "test-results/note-folding.png" });
  await page.evaluate(() =>
    document
      .getElementById("intro-paper")
      .getAnimations({ subtree: true })
      .forEach((a) => a.play()),
  );
  await expect(page.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "flying",
  );
  await page.waitForTimeout(550);
  await page.screenshot({ path: "test-results/note-flying.png" });
  await page.locator("#privacy-open").click();
  const time = await page.evaluate(
    () =>
      document.getElementById("intro-paper").getAnimations().at(-1).currentTime,
  );
  await page.waitForTimeout(300);
  assert.ok(
    Math.abs(
      (await page.evaluate(
        () =>
          document.getElementById("intro-paper").getAnimations().at(-1)
            .currentTime,
      )) - time,
    ) < 5,
    "flight pauses behind dialogs",
  );
  await page.getByRole("button", { name: "我知道了" }).click();
  await expect(page.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.locator("#intro-card")).toBeHidden();
  await expect(page.locator("#intro-paper")).toBeHidden();
  await expect(page.locator("#letter-dialog")).toBeHidden();
  await page.screenshot({ path: "test-results/garden-clear.png" });
  await page.locator("#intro-replay").click();
  await expect(page.locator("#intro-card")).toBeVisible();
  await expect(page.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "waiting",
  );
  await page.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    ),
  );
  const mobile = await context.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await dismissArrival(mobile);
  await expect(mobile.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "flying",
    { timeout: 10000 },
  );
  await mobile.evaluate(() => {
    const a = document.getElementById("intro-paper").getAnimations().at(-1);
    a.pause();
    a.currentTime = 900;
  });
  await mobile.screenshot({ path: "test-results/note-mobile-flying.png" });
  const airborne = await mobile.locator("#intro-paper").boundingBox();
  assert.ok(
    airborne.x >= 0 && airborne.x + airborne.width <= 390,
    "flight stays on mobile screen",
  );
  await mobile.evaluate(() => {
    document.getElementById("intro-paper").getAnimations().at(-1).currentTime =
      1881;
  });
  const plane = await mobile.locator("#intro-paper").boundingBox(),
    hole = await mobile.locator("#tree-door").boundingBox();
  assert.ok(
    Math.hypot(
      plane.x + plane.width / 2 - hole.x - hole.width / 2,
      plane.y + plane.height / 2 - hole.y - hole.height * 0.52,
    ) < 12,
    "plane lands inside the actual hollow",
  );
  await mobile.evaluate(() =>
    document.getElementById("intro-paper").getAnimations().at(-1).play(),
  );
  await expect(mobile.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await context.close();
  const reduced = await browser.newPage({ reducedMotion: "reduce" });
  await reduced.clock.install();
  await reduced.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    ),
  );
  await reduced.goto(base);
  await dismissArrival(reduced);
  await reduced.clock.fastForward(4900);
  await expect(reduced.locator("#intro-card")).toBeVisible();
  await reduced.clock.fastForward(200);
  await expect(reduced.locator("#intro-card")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(reduced.locator("#intro-paper")).toBeHidden();
  await reduced.close();
  assert.deepEqual(errors, []);
  console.log(
    "Intro checks passed: five visible seconds after onboarding, folding, curved flight, dialog pause, actual hollow landing, replay, mobile and reduced motion.",
  );
} finally {
  await browser.close();
}
