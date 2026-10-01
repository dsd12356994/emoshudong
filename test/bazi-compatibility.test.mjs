import { test } from "node:test";
import assert from "node:assert/strict";
import { baziCompatibility } from "../lib/bazi-compatibility.mjs";
import { birthContext } from "../lib/domain.mjs";

test("bazi matching is deterministic, symmetric, and explicitly bounded", () => {
  const a = birthContext({ self: { date: "2005-12-23", time: "08:37" }, other: { date: "2005-09-27", time: "" } });
  const direct = baziCompatibility(a.self, a.other);
  const reverse = baziCompatibility(a.other, a.self);
  assert.equal(direct.score, reverse.score);
  assert.match(direct.label, /娱乐/);
  assert.match(direct.disclaimer, /不是关系成功率/);
  assert.equal(direct.dimensions.length, 3);
  assert.match(direct.method, /40%/);
  assert.match(direct.coverage, /未填时辰/);
  assert.ok(direct.score >= 0 && direct.score <= 100);
});

test("birth context keeps a solo chart and adds a compatibility result only for two people", () => {
  const solo = birthContext({ self: { date: "2005-12-23", time: "" } });
  assert.ok(solo.self);
  assert.equal(solo.other, undefined);
  assert.equal(solo.compatibility, undefined);
  const pair = birthContext({ self: { date: "2005-12-23" }, other: { date: "2005-09-27" } });
  assert.ok(pair.compatibility);
  assert.equal(pair.compatibility.score, baziCompatibility(pair.self, pair.other).score);
});
