const LOOPBACKS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function validAddress(value) {
  const ip = value.trim();
  if (IPV4.test(ip))
    return ip.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255)
      ? ip
      : null;
  return IPV6.test(ip) && ip.length <= 64 ? ip : null;
}

/** Trust forwarded addresses only from the loopback reverse proxy. */
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || "unknown";
  if (!LOOPBACKS.has(peer)) return peer;
  const real = typeof req.headers?.["x-real-ip"] === "string"
    ? req.headers["x-real-ip"]
    : typeof req.headers?.["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]
      : "";
  return validAddress(real) || peer;
}
