import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";

const dir = mkdtempSync(join(tmpdir(), "treehole-model-ui-"));
const calls = [],
  errors = [];
let rejected = false;
const server = createApp({
  env: { DEEPSEEK_API_KEY: "synthetic-owner-key", DAILY_GLOBAL_LIMIT: "1" },
  dataDir: dir,
  providerFetch: async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body),
    });
    return rejected
      ? new Response("sensitive upstream details", { status: 401 })
      : Response.json({
          choices: [
            {
              message: { content: "这是一封模拟回信。" },
              finish_reason: "stop",
            },
          ],
        });
  },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
mkdirSync("test-results", { recursive: true });
const fakeKey = "synthetic-personal-key";
async function setup(mobile = false) {
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "huisheng-garden",
      JSON.stringify({ color: "#f4dab0", motion: false }),
    ),
  );
  await page.goto(base);
  await page.locator("#account-guest").click();
  await expect(page.locator("#announcement-dialog")).toBeVisible();
  await page.locator("#announcement-close").click();
  await expect(page.locator("#funding-dialog")).toBeVisible();
  return page;
}
try {
  const page = await setup();
  await page.screenshot({ path: "test-results/funding-desktop.png" });
  await expect(page.locator("#funding-dialog")).toContainText("100 元");
  await page.locator("#funding-api-open").click();
  await expect(page.locator("#model-provider option")).toHaveCount(8);
  await page.locator('input[name="model-source"][value="personal"]').check();
  for (const name of [
    "deepseek",
    "qwen",
    "kimi",
    "glm",
    "doubao",
    "openai",
    "gemini",
    "claude",
  ]) {
    await page.locator("#model-provider").selectOption(name);
    await expect(page.locator("#model-endpoint")).toHaveValue(/^https:\/\//);
    await expect(page.locator("#model-name")).not.toHaveValue("");
    await expect(page.locator("#model-key")).toHaveValue("");
    await page.locator("#model-key").fill(fakeKey);
  }
  await page.locator('[data-close="model-dialog"]').first().click();
  await expect(page.locator("#model-key")).toHaveValue("");
  assert.equal(calls.length, 0, "opening or cancelling settings sends nothing");
  await expect(page.locator("#funding-dialog")).toBeVisible();
  await page.locator("#funding-continue").click();
  await page.locator("#tree-door").click();
  await expect(page.locator("[data-model-recipient]")).toContainText(
    "DeepSeek（共享额度）",
  );
  await page.locator("#chat-consent-accept").click();
  await page.locator("#message").fill("共享额度的合成测试来信");
  await page.locator("#send").click();
  await expect(page.locator("#messages .assistant")).toHaveCount(1);
  await expect(page.locator("#send")).toContainText("寄出");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, "Bearer synthetic-owner-key");

  await page.locator("#message").fill("还没寄出的合成草稿");
  await page.locator("#letter-api-open").click();
  await expect(page.locator("#model-shared-status")).toContainText(
    "次数已用完",
  );
  await page.locator('input[name="model-source"][value="personal"]').check();
  await page.locator("#model-provider").selectOption("qwen");
  await page.locator("#model-key").fill(fakeKey);
  await page.locator("#model-key-consent").check();
  await page.screenshot({ path: "test-results/model-settings-desktop.png" });
  await page.locator("#model-test").click();
  await expect(page.locator("#model-feedback")).toContainText("已收到模型回应");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.messages, [
    { role: "user", content: "Reply with OK." },
  ]);
  await page.locator("#model-save").click();
  await expect(page.locator("#chat-consent-dialog")).toBeVisible();
  await expect(page.locator("#letter-dialog")).toBeHidden();
  await expect(page.locator("[data-model-recipient]")).toContainText("Qwen");
  assert.equal(calls.length, 2, "save cannot send or test automatically");
  await expect(page.locator("#model-key")).toHaveValue("");
  await page.locator("#chat-consent-accept").click();
  await expect(page.locator("#message")).toHaveValue("还没寄出的合成草稿");
  await page.locator("#send").click();
  await expect(page.locator("#messages .assistant")).toHaveCount(2);
  await expect(page.locator("#send")).toContainText("寄出");
  assert.equal(calls.length, 3);
  assert.equal(calls[2].headers.Authorization, `Bearer ${fakeKey}`);
  assert.ok(
    calls[2].body.messages.some((m) => m.content === "共享额度的合成测试来信"),
  );
  assert.ok(calls[2].url.includes("dashscope.aliyuncs.com"));
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    }),
  );
  assert.ok(!storage.includes(fakeKey));

  rejected = true;
  await page.locator("#message").fill("失败时保留这封合成草稿");
  await page.locator("#send").click();
  await expect(page.locator("#status")).toContainText("密钥或访问权限");
  await expect(page.locator("#message")).toHaveValue("失败时保留这封合成草稿");
  assert.equal(calls.length, 4);
  assert.equal(calls[3].headers.Authorization, `Bearer ${fakeKey}`);
  await page.locator("#letter-api-open").click();
  await expect(page.locator("#model-key")).toHaveValue(fakeKey);
  await page.locator("#model-forget").click();
  await page.locator("#chat-consent-accept").click();
  await expect(page.locator("#send")).toBeDisabled();
  await page.locator("#letter-api-open").click();
  await page.locator('input[name="model-source"][value="personal"]').check();
  await expect(page.locator("#model-key")).toHaveValue("");
  await page.locator("#model-key").fill(fakeKey);
  await page.locator("#model-key-consent").check();
  await page.locator("#model-save").click();
  await page.reload();
  await page.locator("#account-guest").click();
  await page.locator("#announcement-close").click();
  await page.locator("#funding-api-open").click();
  await expect(page.locator("#model-provider option")).toHaveCount(8);
  await expect(
    page.locator('input[name="model-source"][value="shared"]'),
  ).toBeChecked();
  await page.locator('input[name="model-source"][value="personal"]').check();
  await expect(page.locator("#model-key")).toHaveValue("");
  assert.equal(calls.length, 4);
  await page.close();

  const mobile = await setup(true);
  await mobile.screenshot({ path: "test-results/funding-mobile.png" });
  await expect(mobile.locator("#funding-continue")).toBeInViewport();
  await mobile.locator("#funding-api-open").tap();
  await expect(mobile.locator("#model-provider option")).toHaveCount(8);
  await mobile.locator('input[name="model-source"][value="personal"]').check();
  await mobile.screenshot({ path: "test-results/model-settings-mobile.png" });
  for (const selector of ["#model-dialog", "#funding-dialog"]) {
    const box = await mobile.locator(selector).boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= 390 &&
        box.y >= 0 &&
        box.y + box.height <= 844,
    );
    assert.equal(
      await mobile
        .locator(selector)
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
    );
  }
  await mobile.locator("#model-save").scrollIntoViewIfNeeded();
  await expect(mobile.locator("#model-save")).toBeInViewport();
  await mobile.locator('[data-close="model-dialog"]').first().tap();
  await mobile.locator("#funding-continue").tap();
  await expect(mobile.locator("#garden-api-open")).toBeInViewport();
  await mobile.screenshot({ path: "test-results/model-garden-mobile.png" });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "Model UI passed: notice order, eight presets, no auto-send, explicit test, independent own-key chat, recipient re-consent with draft/history, no fallback or persisted key, refresh reset and mobile layout. No paid API calls.",
  );
} finally {
  await browser.close();
  await new Promise((r) => {
    server.close(r);
    server.closeAllConnections();
  });
  rmSync(dir, { recursive: true, force: true });
}
