import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createModelLimiter,
  LimiterError,
  LimiterAbortedError,
} from "../lib/model-limiter.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("model limiter bounds concurrency, queues fairly, and rejects overflow", async () => {
  const limiter = createModelLimiter({ concurrency: 1, pendingLimit: 1, waitMs: 100 });
  const first = await limiter.acquire("a");
  const second = limiter.acquire("b");
  await assert.rejects(limiter.acquire("c"), LimiterError);
  first.release();
  const secondLease = await second;
  assert.deepEqual(limiter.snapshot(), { active: 1, pending: 0 });
  secondLease.release();
  assert.deepEqual(limiter.snapshot(), { active: 0, pending: 0 });
});

test("model limiter allows one active and one pending request per client", async () => {
  const limiter = createModelLimiter({ concurrency: 2, pendingLimit: 4, waitMs: 100 });
  const first = await limiter.acquire("same");
  const pending = limiter.acquire("same");
  await assert.rejects(limiter.acquire("same"), LimiterError);
  first.release();
  const next = await pending;
  next.release();
});

test("queued request can be cancelled without consuming a slot", async () => {
  const limiter = createModelLimiter({ concurrency: 1, pendingLimit: 2, waitMs: 100 });
  const first = await limiter.acquire("a");
  const controller = new AbortController();
  const pending = limiter.acquire("b", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, LimiterAbortedError);
  assert.deepEqual(limiter.snapshot(), { active: 1, pending: 0 });
  first.release();
  await wait(0);
  assert.deepEqual(limiter.snapshot(), { active: 0, pending: 0 });
});
