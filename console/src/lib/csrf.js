import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const TOKEN_BYTES = 16;

export function createCsrfToken(now = Date.now()) {
  const nonce = randomBytes(TOKEN_BYTES).toString("hex");
  const issuedAt = String(now);
  const sig = sign(`${nonce}.${issuedAt}`);
  return `${nonce}.${issuedAt}.${sig}`;
}

export function verifyCsrfToken(token, now = Date.now()) {
  if (!token || typeof token !== "string") return false;
  const [nonce, issuedAt, sig] = token.split(".");
  if (!nonce || !issuedAt || !sig || nonce.length !== TOKEN_BYTES * 2) return false;
  if (!/^\d+$/.test(issuedAt)) return false;

  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;
  const ageMs = now - issuedMs;
  if (ageMs < 0 || ageMs > config.csrfTtlMs) return false;

  const expected = sign(`${nonce}.${issuedAt}`);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(payload) {
  return createHmac("sha256", config.csrfSecret).update(payload).digest("hex");
}
