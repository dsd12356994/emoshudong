import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dismissArrival } from "./arrival-helper.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
const errors = [];
const requests = [];
mkdirSync("test-results", { recursive: true });
async function setup(mobile = false) {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: true }),
    );
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(tool) {
          window.testDraftTool = tool;
        },
      },
    });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true } }),
  );
  await page.route("**/api/chat", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { content: "模拟回信。" } });
  });
  await page.goto(base);
  await dismissArrival(page);
  return page;
}
try {
  const page = await setup();
  const notice = page.locator("#chat-consent-dialog");
  const letter = page.locator("#letter-dialog");
  await expect(notice).toBeHidden();
  // None of the ways of dismissing the notice may count as agreement.
  for (const action of ["escape", "close", "back", "backdrop"]) {
    await page.locator("#tree-door").click();
    await expect(notice).toBeVisible();
    await expect(letter).toBeHidden();
    await expect(page.locator("#chat-consent-title")).toBeFocused();
    if (action === "escape") await page.keyboard.press("Escape");
    if (action === "close")
      await notice.getByRole("button", { name: "暂不写信，回到小院" }).click();
    if (action === "back")
      await notice
        .getByRole("button", { name: "先回小院", exact: true })
        .click();
    if (action === "backdrop") await page.mouse.click(5, 5);
    await expect(notice).toBeHidden();
    await expect(letter).toBeHidden();
    await expect(page.locator("#tree-door")).toBeFocused();
    assert.equal(requests.length, 0);
  }
  // An optional browser agent can stage text, but must use the same gate and
  // may neither grant consent nor send. Dismissing the gate preserves its draft.
  const staged = await page.evaluate(() =>
    window.testDraftTool.execute({ text: "先放在这里的草稿" }),
  );
  assert.deepEqual(staged, { staged: true, sent: false });
  await expect(notice).toBeVisible();
  await page.evaluate(() =>
    document.getElementById("chat-form").requestSubmit(),
  );
  assert.equal(requests.length, 0);
  await page.keyboard.press("Escape");
  await page.locator("#tree-door").click();
  await expect(notice).toBeVisible();
  await page.locator("#chat-consent-detail").click();
  await expect(page.locator("#privacy-dialog")).toBeVisible();
  await page.locator("#privacy-dialog [data-close]").first().click();
  await expect(notice).toBeVisible();
  await expect(letter).toBeHidden();
  await notice.screenshot({ path: "test-results/chat-consent-desktop.png" });
  await page.locator("#chat-consent-accept").click();
  await expect(notice).toBeHidden();
  await expect(letter).toBeVisible();
  await expect(page.locator("#message")).toHaveValue("先放在这里的草稿");
  await expect(page.locator("#message")).toBeFocused();
  await expect(page.locator("#message")).toBeEditable();
  await expect(page.locator("#send")).toBeEnabled();
  assert.equal(
    requests.length,
    0,
    "accepting the notice must not send the draft",
  );
  await page.locator("#send").click();
  await expect(page.locator(".message.assistant")).toContainText("模拟回信。");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].consent, true);
  await page.locator('[data-close="letter-dialog"]').click();
  await page.locator("#tree-door").focus();
  await page.keyboard.press("Enter");
  await expect(letter).toBeVisible();
  await expect(notice).toBeHidden();
  await page.reload();
  await dismissArrival(page);
  await page.locator("#tree-door").click();
  await expect(notice).toBeVisible();
  await expect(letter).toBeHidden();
  assert.equal(requests.length, 1);
  await page.close();

  const mobile = await setup(true);
  await mobile.locator("#tree-door").tap();
  const mobileNotice = mobile.locator("#chat-consent-dialog");
  await expect(mobileNotice).toBeVisible();
  await expect(mobile.locator("#chat-consent-accept")).toBeInViewport();
  assert.equal(
    await mobileNotice.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await mobile.screenshot({ path: "test-results/chat-consent-mobile.png" });
  await mobile.locator("#chat-consent-accept").tap();
  await expect(mobile.locator("#letter-dialog")).toBeVisible();
  await mobile.locator("#message").fill("确认后可以直接写信");
  await expect(mobile.locator("#send")).toBeEnabled();
  assert.equal(requests.length, 1);
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "Consent checks passed: notice before writing, explicit acceptance, all dismissals, privacy details, draft staging, no automatic sending, same-page reuse, reload reset and mobile layout.",
  );
} finally {
  await browser.close();
}
