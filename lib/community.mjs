import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const DAY = 86400000;
const digest = (s) => createHash("sha256").update(s).digest("hex");
export const gardenDay = (now) =>
  new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const nextGardenDay = (now) =>
  Date.parse(`${gardenDay(now)}T00:00:00+08:00`) + DAY;
export class CommunityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function createCommunity({ dataDir, now = Date.now }) {
  const usersFile = join(dataDir, "accounts.json"),
    boardFile = join(dataDir, "board.json");
  const read = (file, fallback) =>
    existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  let accounts = read(usersFile, { users: [], sessions: [] });
  let board = read(boardFile, { day: gardenDay(now()), posts: [] });
  const save = (file, value) => {
    writeFileSync(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  };
  const attempts = new Map();
  let hashing = 0,
    timer;
  function cleanup() {
    if (board.day !== gardenDay(now())) {
      board = { day: gardenDay(now()), posts: [] };
      save(boardFile, board);
    }
    const active = accounts.sessions.filter((s) => s.expires > now());
    if (active.length !== accounts.sessions.length) {
      accounts.sessions = active;
      save(usersFile, accounts);
    }
    for (const [key, value] of attempts)
      if (value.until <= now()) attempts.delete(key);
  }
  function schedule() {
    timer = setTimeout(
      () => {
        cleanup();
        schedule();
      },
      Math.max(100, nextGardenDay(now()) - now()),
    );
    timer.unref();
  }
  cleanup();
  schedule();
  function token(req) {
    const raw = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("garden_session="))
      ?.slice(15);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? digest(raw) : null;
  }
  function user(req) {
    cleanup();
    const hash = token(req);
    const session = accounts.sessions.find(
      (s) => s.token === hash && s.expires > now(),
    );
    return session && accounts.users.find((u) => u.id === session.userId);
  }
  function cookie(req, res, raw, maxAge) {
    res.setHeader(
      "Set-Cookie",
      `garden_session=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.socket.encrypted ? "; Secure" : ""}`,
    );
  }
  function snapshot(req, current = user(req)) {
    return {
      user: current ? { nickname: current.nickname } : null,
      day: board.day,
      serverTime: now(),
      resetAt: nextGardenDay(now()),
      posts: board.posts.map((p) => ({
        id: p.id,
        text: p.text,
        name: p.anonymous ? "路过的小猫" : p.nickname,
        anonymous: p.anonymous,
        createdAt: p.createdAt,
        own: p.userId === current?.id,
      })),
    };
  }
  function throttle(req) {
    const key = digest(req.socket.remoteAddress || "unknown");
    const value = attempts.get(key) || { count: 0, until: now() + 15 * 60000 };
    if (value.count >= 20 || (!attempts.has(key) && attempts.size >= 2000))
      throw new CommunityError("尝试有点多，请十五分钟后再来。", 429);
    value.count++;
    attempts.set(key, value);
  }
  async function action(path, body, req, res) {
    cleanup();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new CommunityError("请填写完整信息。");
    if (path === "/api/account/logout") {
      const hash = token(req);
      accounts.sessions = accounts.sessions.filter((s) => s.token !== hash);
      save(usersFile, accounts);
      cookie(req, res, "", 0);
      return snapshot(req);
    }
    if (path === "/api/account/register" || path === "/api/account/login") {
      throttle(req);
      const nickname =
        typeof body.nickname === "string"
          ? body.nickname.normalize("NFKC").trim()
          : "";
      const password = body.password;
      if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(nickname))
        throw new CommunityError(
          "昵称用 2–20 个汉字、字母、数字、下划线或短横线。",
        );
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      )
        throw new CommunityError("密码请使用 8–128 个字符。");
      if (hashing >= 2)
        throw new CommunityError("小院正在办理入住，请稍等片刻。", 429);
      const key = nickname.toLowerCase();
      let current = accounts.users.find((u) => u.key === key);
      const registering = path.endsWith("register");
      if (registering && current)
        throw new CommunityError("这个昵称已经有人使用，换一个试试。", 409);
      if (registering && accounts.users.length >= 1000)
        throw new CommunityError("小院暂时住满了，请稍后再来。", 429);
      const salt = current?.salt || randomBytes(16).toString("hex");
      hashing++;
      let hash;
      try {
        hash = await derive(password, salt, 64);
      } finally {
        hashing--;
      }
      if (registering) {
        if (accounts.users.length >= 1000)
          throw new CommunityError("小院暂时住满了，请稍后再来。", 429);
        if (accounts.users.some((u) => u.key === key))
          throw new CommunityError("这个昵称已经有人使用。", 409);
        current = {
          id: randomBytes(16).toString("hex"),
          key,
          nickname,
          salt,
          hash: hash.toString("hex"),
          lastPostAt: 0,
        };
        accounts.users.push(current);
      } else if (
        !current ||
        !timingSafeEqual(hash, Buffer.from(current.hash, "hex"))
      )
        throw new CommunityError("昵称或密码不正确。", 401);
      const raw = randomBytes(32).toString("hex");
      accounts.sessions = accounts.sessions
        .filter((s) => s.userId !== current.id)
        .concat({
          token: digest(raw),
          userId: current.id,
          expires: now() + 7 * DAY,
        });
      save(usersFile, accounts);
      cookie(req, res, raw, 7 * 86400);
      // The request still carries the old cookie; return the new public identity.
      return snapshot(req, current);
    }
    const current = user(req);
    if (!current)
      throw new CommunityError("先登记一个昵称，再留下你的话吧。", 401);
    if (path === "/api/board/post") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (
        !text ||
        text.length > 280 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)
      )
        throw new CommunityError("留言请写 1–280 个字。");
      if (typeof body.anonymous !== "boolean")
        throw new CommunityError("请选择是否匿名。");
      if (now() - current.lastPostAt < 15000)
        throw new CommunityError("刚刚的字还没干，十五秒后再写一张吧。", 429);
      const postedToday = current.postDay === board.day ? current.postCount : 0;
      if (board.posts.length >= 500 || postedToday >= 20)
        throw new CommunityError("今天的纸条已经写满了，明天再来吧。", 429);
      board.posts.push({
        id: randomBytes(12).toString("hex"),
        userId: current.id,
        nickname: current.nickname,
        anonymous: body.anonymous,
        text,
        createdAt: now(),
      });
      current.lastPostAt = now();
      current.postDay = board.day;
      current.postCount = postedToday + 1;
      save(usersFile, accounts);
      save(boardFile, board);
    } else if (path === "/api/board/delete") {
      const post = board.posts.find((p) => p.id === body.id);
      if (!post || post.userId !== current.id)
        throw new CommunityError("只能收回自己的纸条。", 403);
      board.posts = board.posts.filter((p) => p.id !== post.id);
      save(boardFile, board);
    }
    return snapshot(req);
  }
  return { snapshot, action, cleanup, close: () => clearTimeout(timer) };
}
