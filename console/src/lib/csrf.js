import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const TOKEN_BYTES = 16;

export function createCsrfToken() {
  const nonce = randomBytes(TOKEN_BYTES).toString("hex");
  const sig = sign(nonce);
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token) {
  if (!token || typeof token !== "string") return false;
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig || nonce.length !== TOKEN_BYTES * 2) return false;
  const expected = sign(nonce);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(nonce) {
  return createHmac("sha256", config.csrfSecret).update(nonce).digest("hex");
}
