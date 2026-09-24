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

const root = dirname(fileURLToPath(import.meta.url));
export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const dataDir = options.dataDir ?? join(root, "data");
  mkdirSync(dataDir, { recursive: true });
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
  function reserve(ip) {
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Shanghai",
    });
    if (quota.day !== day)
      quota = { day, total: 0, ips: {}, salt: randomBytes(32).toString("hex") };
    const hash = createHmac("sha256", quota.salt).update(ip).digest("hex");
    if (quota.total >= globalLimit || (quota.ips[hash] ?? 0) >= ipLimit)
      return false;
    quota.total++;
    quota.ips[hash] = (quota.ips[hash] ?? 0) + 1;
    writeFileSync(quotaFile + ".tmp", JSON.stringify(quota), { mode: 0o600 });
    renameSync(quotaFile + ".tmp", quotaFile);
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
    if (req.method === "GET" && url.pathname === "/api/status")
      return send(res, 200, {
        ready: !!apiKey,
        provider: "DeepSeek",
        privatePreview: true,
      });
    if (req.method === "GET" && url.pathname === "/api/library")
      return send(res, 200, { cards: catalog });
    if (
      req.method !== "POST" ||
      !["/api/chat", "/api/birth"].includes(url.pathname)
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
      if (url.pathname === "/api/birth")
        return send(res, 200, { birth: birthContext(body) });
      const chat = validateChat(body);
      if (!apiKey)
        return send(res, 503, {
          error: "树洞尚未接通模型，请等待站主配置。你的文字没有发送给模型。",
        });
      const ip = req.socket.remoteAddress ?? "unknown";
      if (inFlight.has(ip) || inFlight.size >= 3)
        return send(res, 429, { error: "上一段回应还在生成，请稍等。" });
      if (!reserve(ip))
        return send(res, 429, { error: "今天的对话额度已用完，请明天再来。" });
      inFlight.add(ip);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", cancel);
      try {
        const result = await runAgent({
          chat,
          system: SYSTEM_PROMPT,
          model: env.DEEPSEEK_MODEL || "deepseek-flash",
          apiKey,
          upstream,
          tokens,
          signal: controller.signal,
        });
        send(res, 200, result);
      } catch (error) {
        if (!res.destroyed)
          send(res, error instanceof UpstreamError ? 502 : 504, {
            error:
              error instanceof UpstreamError
                ? error.status === 402
                  ? "模型账户余额不足，请联系站主。"
                  : "这次没有收到完整回信，请稍后重试。"
                : "这次回应超时或连接中断了。你可以稍后重试。",
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
          error instanceof InputError || error instanceof SyntaxError
            ? 400
            : 500,
          {
            error:
              error instanceof InputError
                ? error.message
                : "请求没有完成，请稍后重试。",
          },
        );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
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
