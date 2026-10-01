import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "../lib/client-ip.mjs";

const request = (remoteAddress, headers = {}) => ({
  socket: { remoteAddress },
  headers,
});

test("client IP trusts forwarding only from the loopback proxy", () => {
  assert.equal(
    clientIp(request("127.0.0.1", { "x-real-ip": "203.0.113.7" })),
    "203.0.113.7",
  );
  assert.equal(
    clientIp(request("::1", { "x-forwarded-for": "2001:db8::7, 127.0.0.1" })),
    "2001:db8::7",
  );
  assert.equal(
    clientIp(request("203.0.113.9", { "x-real-ip": "198.51.100.4" })),
    "203.0.113.9",
  );
  assert.equal(
    clientIp(request("127.0.0.1", { "x-real-ip": "not-an-ip" })),
    "127.0.0.1",
  );
});
