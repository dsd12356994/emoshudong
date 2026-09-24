import { chromium } from "@playwright/test";
import { dismissArrival } from "./arrival-helper.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
const dir = new URL("../test-results/", import.meta.url);
mkdirSync(dir, { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // Deterministic UI integration check; no private text sent to the provider.
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true } }),
  );
  let submitted;
  await page.route("**/api/chat", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: { content: "这件事让你很难过。我们可以先慢慢说，不急着决定。" },
    });
  });
  await page.goto(base);
  await dismissArrival(page);
  await page.locator("#cat-dialog").waitFor();
  await page.locator(".cat-portrait").evaluate((img) => img.decode());
  await page.screenshot({ path: fileURLToPath(new URL("arrival.png", dir)) });
  await page.locator('[data-color="#f1b4c3"]').click();
  await page.locator("#cat-form button[type=submit]").click();
  await page.screenshot({
    path: fileURLToPath(new URL("desktop.png", dir)),
    fullPage: true,
  });
  await page.screenshot({
    path: fileURLToPath(new URL("../docs/preview.jpg", dir)),
    type: "jpeg",
    quality: 88,
  });
  await page.locator("#motion-toggle").click();
  assert.equal(
    await page.locator("#motion-toggle").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page
      .locator(".petals i")
      .first()
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    "paused",
  );
  await page.locator("#tree-door").click();
  await page.locator("#letter-dialog").waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("letter-desktop.png", dir)),
  });
  await page.locator("[data-prompt]").first().click();
  assert.ok(await page.locator("#message").inputValue());
  assert.equal(await page.locator("#send").isDisabled(), true);
  await page.locator("#consent").check();
  await page.locator("#send").click();
  await page
    .getByText("这件事让你很难过。我们可以先慢慢说，不急着决定。")
    .waitFor();
  assert.equal(submitted.consent, true);
  await page.locator("#birth-open").click();
  await page.locator("#birth-enabled").check();
  await page.locator("#self-date").fill("2000-01-01");
  await page.getByRole("button", { name: "保存本次设置" }).click();
  await page.locator("#birth-dialog").waitFor({ state: "hidden" });
  assert.ok(
    (await page.locator("#birth-summary").textContent()).includes("时辰未知"),
  );
  await page.locator("#new-chat").click();
  await page.locator("#confirm-clear").click();
  assert.equal(await page.locator("#messages").textContent(), "");
  assert.equal(await page.locator("#self-date").inputValue(), "");
  await page.screenshot({
    path: fileURLToPath(new URL("../docs/letters.jpg", dir)),
    type: "jpeg",
    quality: 88,
  });
  await page.locator('[data-close="letter-dialog"]').click();
  await page.locator("#library-open").click();
  await page.locator(".library-list article").first().waitFor();
  assert.equal(await page.locator(".library-list article").count(), 7);
  await page.locator('[data-close="library-dialog"]').click();
  await page.locator("#privacy-open").click();
  await page.getByRole("button", { name: "我知道了" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", dir)),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const door = await page.locator("#tree-door").boundingBox();
  assert.ok(
    door.x >= 0 && door.x + door.width <= 390,
    "mobile tree entrance must be fully visible",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    await page.evaluate(() => Object.keys(localStorage).sort()),
    ["huisheng-garden", "huisheng-pet"],
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("huisheng-garden")).color,
    ),
    "#f1b4c3",
  );
  await page.locator("#tree-door").click();
  await page.locator("#letter-dialog").waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("letter-mobile.png", dir)),
  });
  assert.equal(
    await page
      .locator("#letter-dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.reload();
  await dismissArrival(page);
  assert.equal(await page.locator("#cat-dialog").isVisible(), false);
  assert.equal(await page.locator("#messages").textContent(), "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator("#petals")
      .evaluate((el) => getComputedStyle(el).display),
    "none",
  );
  await context.close();
  console.log(
    "Browser checks passed: desktop/mobile, consent, conversation, birth, deletion, privacy, no overflow.",
  );
} finally {
  await browser.close();
}
