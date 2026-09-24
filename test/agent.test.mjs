import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
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
