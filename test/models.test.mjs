import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providers, personalConnection } from "../lib/providers.mjs";
import { runAgent } from "../lib/agent.mjs";
import { createApp } from "../server.mjs";

const key = "test-only-personal-key";
const valid = {
  consent: true,
  mode: "advice",
  messages: [{ role: "user", content: "合成测试：想练习沟通" }],
};
const connection = (id) => ({
  provider: id,
  apiKey: key,
  model: providers.find((p) => p.id === id).models[0],
  consent: true,
});
const call = {
  id: "tool-1",
  type: "function",
  function: {
    name: "get_reflection_exercise",
    arguments: '{"kind":"communication"}',
  },
};

test("all eight provider adapters preserve the bounded tool round trip", async () => {
  for (const preset of providers) {
    const captured = [];
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      captured.push({ url, ...options, body });
      const first = captured.length === 1;
      if (preset.id === "claude")
        return Response.json({
          stop_reason: first ? "tool_use" : "end_turn",
          content: first
            ? [
                { type: "text", text: "先看看资料。" },
                {
                  type: "tool_use",
                  id: "tool-1",
                  name: call.function.name,
                  input: { kind: "communication" },
                },
              ]
            : [{ type: "text", text: "模拟回信" }],
        });
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: first
              ? { content: null, tool_calls: [call] }
              : { content: "模拟回信" },
          },
        ],
      });
    };
    const result = await runAgent({
      ...personalConnection(connection(preset.id)),
      chat: { ...valid, birth: null },
      system: "test",
      tokens: 800,
      fetchImpl,
    });
    assert.equal(captured.length, 2, preset.id);
    assert.equal(captured[0].url, preset.endpoint);
    assert.equal(captured[0].redirect, "error");
    assert.equal(result.content, "模拟回信");
    assert.deepEqual(result.toolsUsed, ["get_reflection_exercise"]);
    assert.ok(result.sources.some((s) => s.id === "nhs-relationships"));
    if (preset.id === "claude") {
      assert.equal(captured[0].headers["x-api-key"], key);
      assert.equal(captured[0].headers["anthropic-version"], "2023-06-01");
      assert.ok(captured[0].body.system.includes("test"));
      assert.ok(captured[0].body.tools[0].input_schema);
      assert.equal(captured[1].body.tool_choice.type, "none");
      assert.equal(
        captured[1].body.messages.at(-1).content[0].tool_use_id,
        "tool-1",
      );
      assert.equal(
        captured[1].body.messages.at(-2).content[1].type,
        "tool_use",
      );
    } else {
      assert.equal(captured[0].headers.Authorization, `Bearer ${key}`);
      assert.equal(captured[0].body.tool_choice, "auto");
      assert.equal(captured[1].body.messages.at(-1).tool_call_id, "tool-1");
      if (preset.id === "glm")
        assert.equal(captured[1].body.tool_choice, undefined);
      else assert.equal(captured[1].body.tool_choice, "none");
    }
    if (preset.id === "openai") {
      assert.equal(captured[0].body.max_completion_tokens, 800);
      assert.equal(captured[0].body.max_tokens, undefined);
      assert.equal(captured[0].body.store, false);
      assert.equal(captured[0].body.thinking, undefined);
    }
    if (preset.id === "qwen")
      assert.equal(captured[0].body.enable_thinking, false);
    if (preset.id === "kimi")
      assert.equal(captured[0].body.temperature, undefined);
    if (preset.id === "gemini")
      assert.equal(captured[0].body.reasoning_effort, "none");
  }
});

test("personal configuration rejects redirects, arbitrary endpoints and malformed keys", () => {
  for (const bad of [
    null,
    [],
    {},
    { ...connection("deepseek"), provider: "unknown" },
    { ...connection("deepseek"), endpoint: "http://localhost" },
    { ...connection("deepseek"), apiKey: "bad\r\nheader" },
    { ...connection("deepseek"), model: "bad model" },
    { ...connection("deepseek"), consent: false },
  ])
    assert.throws(() => personalConnection(bad));
});

test("own keys bypass shared quota, never fall back, never persist and test with synthetic text only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "treehole-model-test-"));
  const requests = [];
  let upstreamStatus = 200;
  const server = createApp({
    env: { DEEPSEEK_API_KEY: "owner-test-secret", DAILY_GLOBAL_LIMIT: "1" },
    dataDir: dir,
    providerFetch: async (url, options) => {
      requests.push({ url, ...options, body: JSON.parse(options.body) });
      return upstreamStatus === 200
        ? Response.json({
            choices: [
              { message: { content: "模拟回信" }, finish_reason: "stop" },
            ],
          })
        : new Response(
            "Never echo this upstream body or test-only-personal-key",
            { status: upstreamStatus },
          );
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (data, path = "/api/chat", headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  try {
    assert.equal((await post(valid)).status, 200);
    assert.equal(requests[0].headers.Authorization, "Bearer owner-test-secret");
    assert.equal((await post(valid)).status, 429);
    assert.equal(
      (await (await fetch(base + "/api/status")).json()).ready,
      false,
    );
    assert.equal(
      (await post({ ...valid, connection: connection("qwen") })).status,
      200,
    );
    assert.equal(requests[1].headers.Authorization, `Bearer ${key}`);
    assert.equal(JSON.parse(readFileSync(join(dir, "quota.json"))).total, 1);
    let length = requests.length;
    assert.equal((await post({ ...valid, connection: null })).status, 400);
    assert.equal(
      (
        await post({
          ...valid,
          connection: { ...connection("qwen"), baseUrl: "https://bad.example" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({ ...valid, connection: connection("qwen") }, "/api/chat", {
          Origin: "https://bad.example",
        })
      ).status,
      403,
    );
    assert.equal(requests.length, length);
    const tested = await post(
      { connection: connection("qwen"), messages: valid.messages },
      "/api/model/test",
    );
    assert.equal(tested.status, 200);
    assert.deepEqual(requests.at(-1).body.messages, [
      { role: "user", content: "Reply with OK." },
    ]);
    assert.equal(requests.at(-1).body.max_tokens, 32);
    assert.equal(requests.at(-1).body.tools, undefined);
    upstreamStatus = 401;
    length = requests.length;
    const error = await post({ ...valid, connection: connection("qwen") });
    assert.equal(error.status, 502);
    const errorText = await error.text();
    assert.ok(errorText.includes("密钥或访问权限"));
    assert.ok(!errorText.includes(key) && !errorText.includes("Never echo"));
    assert.equal(requests.length, length + 1, "must not retry with owner key");
    assert.equal(requests.at(-1).headers.Authorization, `Bearer ${key}`);
    const metadata = await (await fetch(base + "/api/providers")).json();
    assert.equal(metadata.providers.length, 8);
    assert.ok(!JSON.stringify(metadata).includes(key));
    for (const name of readdirSync(dir)) {
      const disk = readFileSync(join(dir, name), "utf8");
      assert.ok(
        !disk.includes(key) &&
          !disk.includes("owner-test-secret") &&
          !disk.includes(valid.messages[0].content),
      );
    }
  } finally {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("personal API works with shared service disabled and still has an independent rate limit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "treehole-model-rate-test-"));
  let calls = 0;
  const server = createApp({
    env: { SHARED_ACCESS_ENABLED: "false" },
    dataDir: dir,
    providerFetch: async () => {
      calls++;
      return Response.json({ choices: [{ message: { content: "OK" } }] });
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (await (await fetch(base + "/api/status")).json()).ready,
      false,
    );
    for (let i = 0; i < 21; i++) {
      const response = await fetch(base + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...valid, connection: connection("deepseek") }),
      });
      assert.equal(response.status, i < 20 ? 200 : 429);
    }
    assert.equal(calls, 20);
    assert.ok(!readdirSync(dir).includes("quota.json"));
  } finally {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
