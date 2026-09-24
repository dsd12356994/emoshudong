import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  cards,
  runAgent,
  executeTool,
  searchCards,
  toolDefinitions,
} from "../lib/agent.mjs";
const call = (name, args, id = "c1") => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
test("listening uses supportive references and cannot invoke advice exercises", () => {
  for (const card of cards) {
    assert.ok(card.modes.length);
    assert.ok(card.modes.every((mode) => ["listen", "advice"].includes(mode)));
  }
  const gentle = searchCards("自我关怀 什么都做不好", "psychology", "listen");
  assert.equal(gentle[0].id, "neff-self-compassion");
  assert.ok(!gentle.some((card) => card.exercise));
  assert.ok(
    searchCards("事实 想法 证据", "psychology", "advice").some(
      (card) => card.id === "nhs-thoughts",
    ),
  );
  assert.ok(
    !searchCards("事实 想法 证据", "psychology", "listen").some(
      (card) => card.id === "nhs-thoughts",
    ),
  );
  assert.ok(
    !toolDefinitions(false, "listen").some(
      (t) => t.function.name === "get_reflection_exercise",
    ),
  );
  assert.ok(
    toolDefinitions(false, "advice").some(
      (t) => t.function.name === "get_reflection_exercise",
    ),
  );
  const denied = executeTool(
    call("get_reflection_exercise", { kind: "thought_check" }),
    null,
    "listen",
  );
  assert.ok(denied.data.error);
  assert.deepEqual(denied.sources, []);
  const retrieved = executeTool(
    call("search_reference_cards", { query: "自我关怀", domain: "psychology" }),
    null,
    "listen",
  );
  assert.ok(retrieved.sources.includes("neff-self-compassion"));
  assert.ok(
    executeTool(
      call("search_reference_cards", { query: "八字", domain: "bazi" }),
      null,
      "listen",
    ).data.error,
  );
});

test("current mode loads its writing reference without a tool or invented sources", async () => {
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    requests.push(JSON.parse(raw));
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: { content: "模拟回信，不评估语气。" },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const messages = [{ role: "user", content: "我最近总是很自责。" }];
  const options = {
    system: "test",
    model: "test",
    apiKey: "test",
    tokens: 800,
    upstream: `http://127.0.0.1:${upstream.address().port}`,
  };
  try {
    const first = await runAgent({
      ...options,
      chat: { mode: "listen", birth: null, messages },
    });
    const history = [
      ...messages,
      { role: "assistant", content: first.content },
      { role: "user", content: "现在想找个小办法。" },
    ];
    const second = await runAgent({
      ...options,
      chat: { mode: "advice", birth: null, messages: history },
    });
    assert.equal(
      requests.length,
      2,
      "no extra call to load or score the writing reference",
    );
    assert.match(requests[0].messages[0].content, /当前回信方式：先听我说/);
    assert.doesNotMatch(
      requests[0].messages[0].content,
      /当前回信方式：一起想办法/,
    );
    assert.match(requests[1].messages[0].content, /当前回信方式：一起想办法/);
    assert.doesNotMatch(
      requests[1].messages[0].content,
      /当前回信方式：先听我说/,
    );
    assert.deepEqual(requests[1].messages.slice(1), history);
    assert.ok(
      !requests[0].tools.some(
        (t) => t.function.name === "get_reflection_exercise",
      ),
    );
    assert.ok(
      requests[1].tools.some(
        (t) => t.function.name === "get_reflection_exercise",
      ),
    );
    assert.deepEqual(first.sources, []);
    assert.deepEqual(second.sources, []);
    assert.deepEqual(first.toolsUsed, []);
    assert.deepEqual(second.toolsUsed, []);
  } finally {
    await new Promise((r) => {
      upstream.close(r);
      upstream.closeAllConnections();
    });
  }
});
test("reference retrieval matches evidence domain and enforces voluntary birth access", () => {
  assert.equal(searchCards("反复担忧 内耗", "psychology")[0].id, "nhs-worry");
  assert.deepEqual(searchCards("xyznotfound", "psychology"), []);
  assert.ok(
    executeTool(
      call("search_reference_cards", { query: "八字", domain: "bazi" }),
      null,
    ).data.error,
  );
  assert.ok(
    executeTool(call("get_birth_chart", { person: "self" }), null).data.error,
  );
  assert.ok(
    executeTool(call("shell", { command: "anything" }), null).data.error,
  );
  assert.ok(
    executeTool(
      call("get_reflection_exercise", {
        kind: "communication",
        url: "https://bad.example",
      }),
      null,
    ).data.error,
  );
  assert.equal(
    executeTool(call("get_birth_chart", { person: "other" }), {
      self: { pillars: ["甲子"] },
    }).data.chart,
    null,
  );
  assert.ok(
    !toolDefinitions(false).some((t) => t.function.name === "get_birth_chart"),
  );
});
test("agent makes at most two model requests and reports only executed references", async () => {
  const requests = [];
  let extraCall = false;
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    requests.push(body);
    const message =
      body.tool_choice === "auto"
        ? {
            content: null,
            tool_calls: [
              call("get_reflection_exercise", { kind: "communication" }),
            ],
          }
        : extraCall
          ? {
              content: "unexpected",
              tool_calls: [call("get_birth_chart", { person: "self" })],
            }
          : { content: "你可以慢慢说。" };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }));
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const options = {
    chat: {
      mode: "advice",
      birth: null,
      messages: [{ role: "user", content: "想练习沟通" }],
    },
    system: "test",
    model: "test",
    apiKey: "test",
    tokens: 800,
    upstream: `http://127.0.0.1:${upstream.address().port}`,
  };
  try {
    const result = await runAgent(options);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].tool_choice, "none");
    assert.deepEqual(
      result.sources.map((c) => c.id),
      ["nhs-relationships"],
    );
    assert.deepEqual(result.toolsUsed, ["get_reflection_exercise"]);
    assert.equal(requests[1].messages.at(-1).role, "tool");
    assert.ok(JSON.parse(requests[1].messages.at(-1).content).steps.length);
    extraCall = true;
    await assert.rejects(runAgent(options));
    assert.equal(
      requests.length,
      4,
      "must not continue when provider requests a second batch",
    );
  } finally {
    await new Promise((r) => {
      upstream.close(r);
      upstream.closeAllConnections();
    });
  }
});
