import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { createCommunity, gardenDay } from "../lib/community.mjs";
import {
  restorePet,
  advancePet,
  petAction,
  petDay,
} from "../public/pet-state.js";

test("pet remains safe at zero; food is one portion per Beijing day; petting and play help", () => {
  const time = Date.parse("2026-09-24T15:59:00Z");
  let pet = restorePet(null, time);
  assert.equal(petDay(time), "2026-09-24");
  assert.equal(petDay(time + 60000), "2026-09-25");
  pet = petAction(pet, "feed", time);
  assert.deepEqual(petAction(pet, "feed", time), pet);
  assert.equal(pet.fedDay, "2026-09-24");
  pet = petAction(pet, "feed", time + 60000);
  assert.equal(pet.fedDay, "2026-09-25");
  pet = advancePet(pet, time + 30 * 86400000);
  assert.equal(pet.mood, 0);
  assert.equal(pet.activity, 0);
  assert.equal(petAction(pet, "pet", pet.updatedAt).mood, 6);
  assert.ok(petAction(pet, "play", pet.updatedAt, 20).activity > 0);
  assert.equal(restorePet({ version: 1, mood: NaN }, time).mood, 75);
  assert.ok(!("dead" in pet));
});

test("accounts, secure sessions, public anonymity, ownership, quotas, restart and daily deletion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "treehole-community-test-"));
  let now = Date.parse("2026-09-24T10:00:00Z");
  const options = { env: {}, dataDir: dir, now: () => now };
  let app = createApp(options),
    url;
  const start = async () => {
    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${app.address().port}`;
  };
  const close = () =>
    new Promise((resolve) => {
      app.close(resolve);
      app.closeAllConnections();
    });
  const post = (path, body, cookie = "", headers = {}) =>
    fetch(url + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  await start();
  try {
    const signup = await post("/api/account/register", {
      nickname: "桃花测试猫",
      password: "test-password-123",
    });
    assert.equal(signup.status, 200);
    const setCookie = signup.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    const disk = readFileSync(join(dir, "accounts.json"), "utf8");
    assert.ok(!disk.includes("test-password-123"));
    assert.ok(!disk.includes(cookie.split("=")[1]));
    assert.equal(
      (
        await post("/api/account/register", {
          nickname: "桃花测试猫",
          password: "another-password",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/api/account/login", {
          nickname: "桃花测试猫",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (await post("/api/board/post", { text: "hello", anonymous: true }))
        .status,
      401,
    );
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "hello", anonymous: true },
          cookie,
          { Origin: "https://attacker.example" },
        )
      ).status,
      403,
    );
    const text = '<img src=x onerror="alert(1)"> 愿你今天开心';
    let response = await post(
      "/api/board/post",
      { text, anonymous: true },
      cookie,
    );
    assert.equal(response.status, 200);
    const own = (await response.json()).posts[0];
    assert.equal(own.own, true);
    let publicBoard = await (await fetch(url + "/api/community")).json();
    assert.equal(publicBoard.posts[0].name, "路过的小猫");
    assert.equal(publicBoard.posts[0].text, text);
    assert.ok(!JSON.stringify(publicBoard).includes("桃花测试猫"));
    assert.ok(!("userId" in publicBoard.posts[0]));
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "再贴一张", anonymous: false },
          cookie,
        )
      ).status,
      429,
    );
    now += 16000;
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "字".repeat(281), anonymous: true },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "署名纸条", anonymous: false },
          cookie,
        )
      ).status,
      200,
    );
    publicBoard = await (await fetch(url + "/api/community")).json();
    assert.equal(publicBoard.posts[1].name, "桃花测试猫");
    const second = await post("/api/account/register", {
      nickname: "另一只小猫",
      password: "second-password",
    });
    const secondCookie = second.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await post("/api/board/delete", { id: own.id }, secondCookie)).status,
      403,
    );
    assert.equal(
      (await post("/api/board/delete", { id: own.id }, cookie)).status,
      200,
    );
    await close();
    app = createApp(options);
    await start();
    assert.equal(
      (
        await (
          await fetch(url + "/api/community", { headers: { Cookie: cookie } })
        ).json()
      ).user.nickname,
      "桃花测试猫",
    );
    assert.equal(
      (await (await fetch(url + "/api/community")).json()).posts.length,
      1,
    );
    // Removing a note must not reset the daily posting allowance.
    for (let i = 2; i < 20; i++) {
      now += 16000;
      assert.equal(
        (
          await post(
            "/api/board/post",
            { text: `限额测试 ${i}`, anonymous: true },
            cookie,
          )
        ).status,
        200,
      );
    }
    now += 16000;
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "第二十一张", anonymous: true },
          cookie,
        )
      ).status,
      429,
    );
    now = Date.parse("2026-09-24T16:00:00Z");
    publicBoard = await (await fetch(url + "/api/community")).json();
    assert.equal(publicBoard.day, "2026-09-25");
    assert.deepEqual(publicBoard.posts, []);
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, "board.json"), "utf8")).posts,
      [],
    );
    const login = await post("/api/account/login", {
      nickname: "桃花测试猫",
      password: "test-password-123",
    });
    assert.equal(login.status, 200);
    const rotated = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "旧会话", anonymous: true },
          cookie,
        )
      ).status,
      401,
    );
    assert.equal((await post("/api/account/logout", {}, rotated)).status, 200);
    assert.equal(
      (
        await post(
          "/api/board/post",
          { text: "退出后", anonymous: true },
          rotated,
        )
      ).status,
      401,
    );
    assert.equal((await fetch(url + "/data/accounts.json")).status, 404);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("midnight timer physically clears yesterday's posts even without visitors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "treehole-midnight-test-"));
  const realStart = Date.now(),
    start = Date.parse("2026-09-24T15:59:59.400Z");
  const now = () => start + Date.now() - realStart;
  const community = createCommunity({ dataDir: dir, now });
  const req = { headers: {}, socket: { remoteAddress: "test" } };
  let cookie;
  const res = {
    setHeader(_name, value) {
      cookie = value.split(";")[0];
    },
  };
  try {
    await community.action(
      "/api/account/register",
      { nickname: "午夜测试猫", password: "midnight-password" },
      req,
      res,
    );
    req.headers.cookie = cookie;
    await community.action(
      "/api/board/post",
      { text: "午夜之前的纸条", anonymous: true },
      req,
      res,
    );
    assert.equal(gardenDay(now()), "2026-09-24");
    await new Promise((resolve) => setTimeout(resolve, 750));
    const saved = JSON.parse(readFileSync(join(dir, "board.json"), "utf8"));
    assert.equal(saved.day, "2026-09-25");
    assert.deepEqual(saved.posts, []);
  } finally {
    community.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
