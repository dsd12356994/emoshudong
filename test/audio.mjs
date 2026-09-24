import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { dismissArrival } from "./arrival-helper.mjs";

const dir = mkdtempSync(join(tmpdir(), "treehole-audio-"));
const server = createApp({ env: {}, dataDir: dir });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
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
      JSON.stringify({ color: "#f4dab0", motion: false }),
    );
    window.audioProbe = { contexts: [], sources: [] };
    // Tag decoded buffers by URL so assertions count real meows, not UI cues.
    const files = new WeakMap();
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const data = await arrayBuffer.call(this);
      files.set(data, new URL(this.url).pathname);
      return data;
    };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.audioProbe.contexts.push(this);
      }
      async decodeAudioData(data) {
        const file = files.get(data);
        const buffer = await super.decodeAudioData(data);
        files.set(buffer, file);
        return buffer;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const record = {
          loop: false,
          stopped: false,
          duration: 0,
          nonzero: false,
        };
        const start = source.start.bind(source),
          stop = source.stop.bind(source);
        source.start = (...args) => {
          record.loop = source.loop;
          record.file = files.get(source.buffer);
          record.at = performance.now();
          record.duration = source.buffer?.duration;
          record.nonzero = source.buffer
            ?.getChannelData(0)
            .some((v) => Math.abs(v) > 0.0001);
          window.audioProbe.sources.push(record);
          start(...args);
        };
        source.stop = (...args) => {
          record.stopped = true;
          stop(...args);
        };
        source.addEventListener("ended", () => (record.stopped = true));
        return source;
      }
    };
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: true } }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: { content: "这是一封没有调用付费服务的测试回信。" },
    }),
  );
  await page.goto(base);
  return page;
}
const liveMusic = (page) =>
  page.evaluate(
    () => audioProbe.sources.filter((s) => s.loop && !s.stopped).length,
  );
const sounds = (page) =>
  page.evaluate(() => audioProbe.sources.filter((s) => !s.loop).length);
const meows = (page) =>
  page.evaluate(
    () =>
      audioProbe.sources.filter((s) => s.file?.endsWith("/cat-meow.wav"))
        .length,
  );
try {
  const page = await setup();
  const fetched = [];
  page.on("request", (r) => {
    if (r.url().includes("/assets/audio/")) fetched.push(r.url());
  });
  assert.equal(await page.evaluate(() => audioProbe.contexts.length), 0);
  assert.deepEqual(fetched, []);
  await dismissArrival(page);
  assert.equal(
    fetched.some((url) => url.endsWith(".mp3")),
    false,
  );
  await expect(page.locator("#music-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#music-toggle").click();
  await expect.poll(() => liveMusic(page)).toBe(1);
  assert.ok(
    await page.evaluate(() =>
      audioProbe.sources.some((s) => s.loop && s.duration > 120 && s.nonzero),
    ),
  );
  await page.locator("#audio-settings-open").click();
  await expect(page.locator("#audio-status")).toContainText("Forget Me Not");
  await page.screenshot({ path: "test-results/audio-desktop.png" });
  await page.locator("#music-volume").fill("23");
  await expect(page.locator("#music-volume-label")).toHaveText("23%");
  await page.locator("#audio-track").selectOption("trifle");
  await expect(page.locator("#audio-status")).toContainText(
    "正在轻轻播放：A Simple Trifle",
  );
  assert.equal(await liveMusic(page), 1);
  assert.ok(
    await page.evaluate(() =>
      audioProbe.sources.some(
        (s) =>
          s.loop &&
          s.duration > 24 &&
          s.duration < 25 &&
          s.nonzero &&
          !s.stopped,
      ),
    ),
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => audioProbe.contexts[0].state))
    .toBe("suspended");
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => audioProbe.contexts[0].state))
    .toBe("running");
  assert.equal(await liveMusic(page), 1);
  await page.locator("#music-switch").uncheck();
  assert.equal(await liveMusic(page), 0);
  await page.locator("#audio-dialog [data-close]").first().click();

  await page.locator("#cottage-door").click();
  await expect(page.locator("#cottage-dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/audio-room-desktop.png" });
  const desktopTitle = await page.locator(".room-name").boundingBox();
  assert.ok(Math.abs(desktopTitle.x + desktopTitle.width / 2 - 720) < 2);
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  await page.locator('[data-pet="head"]').click();
  await expect.poll(() => meows(page)).toBe(1);
  assert.ok(
    await page.evaluate(() =>
      audioProbe.sources.some(
        (s) =>
          s.file?.endsWith("/cat-meow.wav") &&
          s.nonzero &&
          s.duration > 1.5 &&
          s.duration < 1.6,
      ),
    ),
  );
  await page.evaluate(async () => {
    const { playSound } = await import("/garden-audio.js");
    await Promise.all(Array.from({ length: 20 }, () => playSound("meow")));
  });
  assert.equal(await meows(page), 1, "rapid interactions cannot stack meows");
  for (const part of ["tail", "belly", "paw"]) {
    await page.waitForTimeout(800);
    await page.locator(`[data-pet="${part}"]`).click();
    await expect(page.locator("#room-cat")).toHaveAttribute(
      "data-reaction",
      part,
    );
    assert.equal(
      await meows(page),
      1,
      "all body parts share a cooldown while animations still respond",
    );
  }
  await page.locator("#feed-cat").click();
  await expect
    .poll(() => fetched.some((url) => url.endsWith("feed.wav")))
    .toBe(true);
  assert.equal(await meows(page), 1, "feeding shares the same meow cooldown");
  await page.waitForFunction(
    () =>
      performance.now() -
        audioProbe.sources.find((s) => s.file?.endsWith("/cat-meow.wav")).at >=
      10100,
  );
  assert.equal(await meows(page), 1, "ten seconds alone never triggers a meow");
  await page.locator('[data-pet="head"]').click();
  await expect.poll(() => meows(page)).toBe(2);
  await page.locator("#cottage-dialog [data-audio-settings]").click();
  await page.locator("#effects-switch").uncheck();
  await page.locator("#audio-dialog [data-close]").first().click();
  const quiet = await sounds(page);
  await page.locator('[data-pet="tail"]').click();
  await page.locator("#cottage-dialog [data-close]").first().click();
  await page.locator("#tree-door").click();
  await page.locator("#chat-consent-accept").click();
  assert.equal(await sounds(page), quiet);
  await page.locator("#letter-audio-open").click();
  await page.locator("#effects-switch").check();
  await page.locator("#audio-dialog [data-close]").first().click();
  await page.locator("#message").fill("这是音效流程的合成测试。");
  await page.locator("#send").click();
  await expect(page.locator("#send")).toContainText("寄出");
  await expect
    .poll(() => fetched.some((url) => url.endsWith("send.wav")))
    .toBe(true);
  await expect
    .poll(() => fetched.some((url) => url.endsWith("success.wav")))
    .toBe(true);
  assert.ok((await sounds(page)) > quiet);
  await page.reload();
  await dismissArrival(page);
  await page.locator("#audio-settings-open").click();
  await expect(page.locator("#audio-track")).toHaveValue("trifle");
  await expect(page.locator("#music-volume")).toHaveValue("23");
  await expect(page.locator("#music-switch")).not.toBeChecked();
  assert.equal(await liveMusic(page), 0);
  await page.close();

  const mobile = await setup(true);
  await dismissArrival(mobile);
  await expect(mobile.locator("#music-toggle")).toBeInViewport();
  await mobile.locator("#music-toggle").tap();
  await expect.poll(() => liveMusic(mobile)).toBe(1);
  await mobile.screenshot({ path: "test-results/audio-garden-mobile.png" });
  await mobile.locator("#audio-settings-open").tap();
  await mobile.screenshot({ path: "test-results/audio-mobile.png" });
  const box = await mobile.locator("#audio-dialog").boundingBox();
  assert.ok(
    box.x >= 0 &&
      box.x + box.width <= 390 &&
      box.y >= 0 &&
      box.y + box.height <= 844,
  );
  assert.equal(
    await mobile
      .locator("#audio-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
  );
  await mobile.locator("#audio-dialog [data-close]").first().tap();
  await mobile.locator("#music-toggle").tap();
  assert.equal(await liveMusic(mobile), 0);
  await mobile.locator("#cottage-shortcut").tap();
  await expect(mobile.locator("#cottage-dialog")).toBeVisible();
  await mobile.screenshot({ path: "test-results/audio-room-mobile.png" });
  const mobileTitle = await mobile.locator(".room-name").boundingBox();
  assert.ok(Math.abs(mobileTitle.x + mobileTitle.width / 2 - 195) < 2);
  await mobile.close();

  // Failed and slow downloads must leave the switch usable and respect cancel.
  const delayed = await setup();
  await dismissArrival(delayed);
  let held;
  await delayed.route("**/assets/audio/forget-me-not.mp3", (route) => {
    held = route;
  });
  await delayed.locator("#music-toggle").click();
  await expect.poll(() => !!held).toBe(true);
  await delayed.locator("#music-toggle").click();
  await held.continue();
  await expect
    .poll(() => delayed.evaluate(() => audioProbe.sources.length))
    .toBe(0);
  await delayed.unroute("**/assets/audio/forget-me-not.mp3");
  await delayed.locator("#music-toggle").click();
  await expect.poll(() => liveMusic(delayed)).toBe(1);
  await delayed.close();
  const failed = await setup();
  await dismissArrival(failed);
  await failed.route("**/assets/audio/*.mp3", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await failed.locator("#music-toggle").click();
  await expect(failed.locator("#music-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(failed.locator("#audio-live-status")).toContainText("重试");
  await failed.unroute("**/assets/audio/*.mp3");
  await failed.locator("#music-toggle").click();
  await expect.poll(() => liveMusic(failed)).toBe(1);
  await failed.close();
  assert.deepEqual(errors, []);
  console.log(
    "Audio passed with real Web Audio decoding: opt-in/lazy music, two tracks, stop/switch, background suspension, independent effects, shared ten-second meow cooldown without automatic replay, continued pet animations, chat cues, persisted preferences without autoplay, mobile, cancellation and failure retry. No paid model requests.",
  );
} finally {
  await browser.close();
  await new Promise((r) => {
    server.close(r);
    server.closeAllConnections();
  });
  rmSync(dir, { recursive: true, force: true });
}
