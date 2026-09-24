import http from "node:http";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, resolve } from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import {
  SYSTEM_PROMPT,
  InputError,
  validateChat,
  birthContext,
} from "./lib/domain.mjs";
import { runAgent, catalog, UpstreamError } from "./lib/agent.mjs";
import { providers, personalConnection } from "./lib/providers.mjs";
import { completeChat, modelError } from "./lib/model-client.mjs";
import {
  createCommunity,
  CommunityError,
  nextGardenDay,
} from "./lib/community.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const dataDir = options.dataDir ?? join(root, "data");
  mkdirSync(dataDir, { recursive: true });
  const community = createCommunity({ dataDir, now: options.now });
  const quotaFile = join(dataDir, "quota.json");
  let quota = {
    day: "",
    total: 0,
    ips: {},
    salt: randomBytes(32).toString("hex"),
  };
  if (existsSync(quotaFile))
    quota = JSON.parse(readFileSync(quotaFile, "utf8"));
  const inFlight = new Set();
  const personalRate = new Map();
  const sharedEnabled = env.SHARED_ACCESS_ENABLED !== "false";
  const upstream =
    options.upstream ?? "https://api.deepseek.com/chat/completions";
  function number(name, fallback, max) {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error(`Invalid ${name}`);
    return n;
  }
  const globalLimit = number("DAILY_GLOBAL_LIMIT", 100, 10000);
  const ipLimit = number("DAILY_IP_LIMIT", 30, 1000);
  const tokens = number("MAX_OUTPUT_TOKENS", 800, 2000);
  const types = {
    "/": "text/html; charset=utf-8",
    "/app.js": "text/javascript; charset=utf-8",
    "/world.js": "text/javascript; charset=utf-8",
    "/cat-companion.js": "text/javascript; charset=utf-8",
    "/intro-flight.js": "text/javascript; charset=utf-8",
    "/cottage.js": "text/javascript; charset=utf-8",
    "/pet-state.js": "text/javascript; charset=utf-8",
    "/community.js": "text/javascript; charset=utf-8",
    "/pet-motion.js": "text/javascript; charset=utf-8",
    "/arrival.js": "text/javascript; charset=utf-8",
    "/arrival.css": "text/css; charset=utf-8",
    "/model-settings.js": "text/javascript; charset=utf-8",
    "/model-settings.css": "text/css; charset=utf-8",
    "/garden-audio.js": "text/javascript; charset=utf-8",
    "/garden-audio.css": "text/css; charset=utf-8",
    "/assets/audio/forget-me-not.mp3": "audio/mpeg",
    "/assets/audio/a-simple-trifle.mp3": "audio/mpeg",
    "/assets/audio/cat-meow.wav": "audio/wav",
    ...Object.fromEntries(
      ["tap", "paper", "open", "close", "send", "success", "feed"].map(
        (name) => [`/assets/audio/${name}.wav`, "audio/wav"],
      ),
    ),
    "/cottage.css": "text/css; charset=utf-8",
    "/assets/room.webp": "image/webp",
    "/assets/cat-rest.webp": "image/webp",
    "/assets/glove.svg": "image/svg+xml",
    "/style.css": "text/css; charset=utf-8",
    "/favicon.svg": "image/svg+xml",
    "/assets/garden.webp": "image/webp",
    "/assets/cat.webp": "image/webp",
    "/assets/cat-run.webp": "image/webp",
  };
  const assets = new Map(
    Object.keys(types).map((url) => [
      url,
      readFileSync(
        join(root, "public", url === "/" ? "index.html" : url.slice(1)),
      ),
    ]),
  );
  function send(res, status, data) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  }
  function quotaSnapshot(ip) {
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Shanghai",
    });
    if (quota.day !== day)
      quota = { day, total: 0, ips: {}, salt: randomBytes(32).toString("hex") };
    const hash = createHmac("sha256", quota.salt).update(ip).digest("hex");
    return {
      hash,
      available: quota.total < globalLimit && (quota.ips[hash] ?? 0) < ipLimit,
    };
  }
  function reserve(ip) {
    const { hash } = quotaSnapshot(ip);
    if (quota.total >= globalLimit || (quota.ips[hash] ?? 0) >= ipLimit)
      return false;
    quota.total++;
    quota.ips[hash] = (quota.ips[hash] ?? 0) + 1;
    writeFileSync(quotaFile + ".tmp", JSON.stringify(quota), { mode: 0o600 });
    renameSync(quotaFile + ".tmp", quotaFile);
    return true;
  }
  function allowPersonal(ip) {
    const now = Date.now();
    for (const [address, entry] of personalRate)
      if (entry.until <= now) personalRate.delete(address);
    const entry = personalRate.get(ip) ?? { count: 0, until: now + 60000 };
    if (
      entry.count >= 20 ||
      (!personalRate.has(ip) && personalRate.size >= 2000)
    )
      return false;
    entry.count++;
    personalRate.set(ip, entry);
    return true;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && assets.has(url.pathname)) {
      if (url.pathname.startsWith("/assets/"))
        res.setHeader("Cache-Control", "public, max-age=86400");
      res.writeHead(200, { "Content-Type": types[url.pathname] });
      return res.end(
        options.liveAssets
          ? readFileSync(
              join(
                root,
                "public",
                url.pathname === "/" ? "index.html" : url.pathname.slice(1),
              ),
            )
          : assets.get(url.pathname),
      );
    }
    if (req.method === "GET" && url.pathname === "/api/providers")
      return send(res, 200, { providers });
    if (req.method === "GET" && url.pathname === "/api/status") {
      const available = quotaSnapshot(
        req.socket.remoteAddress ?? "unknown",
      ).available;
      return send(res, 200, {
        ready: !!apiKey && sharedEnabled && available,
        sharedReason: !sharedEnabled
          ? "站主暂时关闭了共享服务，可以使用自己的 API。"
          : !apiKey
            ? "共享模型尚未接通，可以先配置自己的 API。"
            : !available
              ? "今天的共享对话次数已用完，可以使用自己的 API，或明天再来。"
              : "共享 DeepSeek 已配置，可尝试寄信；实际余额以服务商账户为准。",
        provider: "DeepSeek",
        privatePreview: true,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/library")
      return send(res, 200, { cards: catalog });
    if (req.method === "GET" && url.pathname === "/api/community")
      return send(res, 200, community.snapshot(req));
    if (req.method === "GET" && url.pathname === "/api/garden-time") {
      const now = (options.now || Date.now)();
      return send(res, 200, { serverTime: now, resetAt: nextGardenDay(now) });
    }
    const communityPaths = [
      "/api/account/register",
      "/api/account/login",
      "/api/account/logout",
      "/api/board/post",
      "/api/board/delete",
    ];
    if (
      req.method !== "POST" ||
      ![
        "/api/chat",
        "/api/model/test",
        "/api/birth",
        ...communityPaths,
      ].includes(url.pathname)
    )
      return send(res, 404, { error: "没有找到这个页面。" });
    // Browser-only JSON calls, no CORS. Origin compares to the actual request authority.
    let originAllowed = true;
    try {
      if (req.headers.origin)
        originAllowed = new URL(req.headers.origin).host === req.headers.host;
    } catch {
      originAllowed = false;
    }
    if (req.headers["sec-fetch-site"] === "cross-site" || !originAllowed)
      return send(res, 403, { error: "请求来源不匹配。" });
    if (!(req.headers["content-type"] ?? "").startsWith("application/json"))
      return send(res, 415, { error: "请求格式必须为JSON。" });
    let bytes = 0,
      chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 90000) throw new InputError("内容太长了，请分几次说。");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (communityPaths.includes(url.pathname))
        return send(
          res,
          200,
          await community.action(url.pathname, body, req, res),
        );
      if (url.pathname === "/api/birth")
        return send(res, 200, { birth: birthContext(body) });
      const testing = url.pathname === "/api/model/test";
      const personal = body && Object.hasOwn(body, "connection");
      const connection = personal ? personalConnection(body.connection) : null;
      if (testing && !personal)
        throw new InputError("连接测试只使用你填写的个人 API。");
      const chat = testing ? null : validateChat(body);
      if (!personal && (!apiKey || !sharedEnabled))
        return send(res, 503, {
          code: "shared_unavailable",
          error:
            "共享模型尚未接通或已暂停，可以在 API 设置中配置自己的密钥。你的文字没有发送给模型。",
        });
      const ip = req.socket.remoteAddress ?? "unknown";
      if (inFlight.has(ip) || inFlight.size >= 3)
        return send(res, 429, { error: "上一段回应还在生成，请稍等。" });
      if (personal ? !allowPersonal(ip) : !reserve(ip))
        return send(res, 429, {
          code: personal ? "personal_rate" : "shared_quota",
          error: personal
            ? "个人接口请求太频繁，请一分钟后再试。"
            : "今天的共享对话次数已用完，可以在 API 设置中使用自己的密钥，或明天再来。",
        });
      inFlight.add(ip);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        testing ? 25000 : 90000,
      );
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", cancel);
      try {
        const credentials = connection ?? {
          provider: "deepseek",
          model: env.DEEPSEEK_MODEL || "deepseek-flash",
          apiKey,
          upstream,
        };
        if (testing) {
          const result = await completeChat({
            ...credentials,
            messages: [{ role: "user", content: "Reply with OK." }],
            tokens: 32,
            signal: controller.signal,
            fetchImpl: options.providerFetch,
          });
          if (!result?.message?.content?.trim()) throw new UpstreamError(502);
          return send(res, 200, {
            ok: true,
            message:
              "已收到模型回应。此测试可能产生少量费用；工具调用能力仍以具体模型为准。",
          });
        }
        const result = await runAgent({
          chat,
          system: SYSTEM_PROMPT,
          ...credentials,
          tokens,
          signal: controller.signal,
          fetchImpl: options.providerFetch,
        });
        send(res, 200, result);
      } catch (error) {
        if (!res.destroyed)
          send(res, error instanceof UpstreamError ? 502 : 504, {
            code:
              !personal &&
              error instanceof UpstreamError &&
              error.status === 402
                ? "shared_balance"
                : "model_error",
            error: modelError(error, personal),
          });
      } finally {
        clearTimeout(timeout);
        res.off("close", cancel);
        inFlight.delete(ip);
      }
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        send(
          res,
          error instanceof CommunityError
            ? error.status
            : error instanceof InputError || error instanceof SyntaxError
              ? 400
              : 500,
          {
            error:
              error instanceof InputError || error instanceof CommunityError
                ? error.message
                : "请求没有完成，请稍后重试。",
          },
        );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on("close", () => community.close());
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.env.ENV_FILE) process.loadEnvFile(process.env.ENV_FILE);
  else if (existsSync(join(root, ".env")))
    process.loadEnvFile(join(root, ".env"));
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3080);
  createApp().listen(port, host, () =>
    console.log(`回声已启动 http://${host}:${port}`),
  );
}
