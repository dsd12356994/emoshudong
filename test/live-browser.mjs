// Explicit smoke test; sends one synthetic message to the configured paid provider.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:3180";
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator("#cat-form button[type=submit]").click();
  await page.locator("#tree-door").click();
  await page
    .getByText("对话只暂存在当前页面，刷新或关闭会清除。", { exact: true })
    .waitFor();
  await page.screenshot({
    path: fileURLToPath(
      new URL("../test-results/live-desktop.png", import.meta.url),
    ),
    fullPage: true,
  });
  await page
    .locator("#message")
    .fill(
      "我在练习如何表达自己的感受。请先用工具查阅资料架中关于关系沟通的卡片，再读取 communication 沟通练习，给我一个简短的练习。",
    );
  await page.locator("#consent").check();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/chat"),
    { timeout: 95000 },
  );
  await page.locator("#send").click();
  const response = await responsePromise;
  if (response.status() !== 200)
    throw new Error("Live model request failed: " + response.status());
  await page
    .locator(".message.assistant .message-body:not(.pending)")
    .waitFor();
  const payload = await response.json();
  if (
    !payload.sources?.length ||
    !payload.toolsUsed?.includes("get_reflection_exercise")
  )
    throw new Error("Expected actual tool use and sources");
  const reply = await page
    .locator(".message.assistant .message-body")
    .textContent();
  if (!reply || reply.length < 5 || errors.length)
    throw new Error("Invalid live reply or browser error");
  await page.screenshot({
    path: fileURLToPath(
      new URL("../test-results/live-conversation.png", import.meta.url),
    ),
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      endpoint: base,
      status: response.status(),
      sources: payload.sources.map((s) => s.id),
      tools: payload.toolsUsed,
      reply,
      browserErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
