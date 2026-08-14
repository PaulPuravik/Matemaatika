import { requireEnv } from "@/lib/env";

export const GATE_COOKIE = "site_gate";

/**
 * The shared front door. The cookie holds an HMAC of a fixed string keyed by
 * the gate password, so it cannot be forged by simply setting a cookie value,
 * and the password itself never reaches the browser.
 *
 * Uses Web Crypto so it runs in the Edge middleware as well as in route handlers.
 */
async function sign(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireEnv("SITE_GATE_PASSWORD")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("site-gate-v1"),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gateToken(): Promise<string> {
  return sign();
}

export function checkPassword(candidate: string): boolean {
  return timingSafeEqual(candidate, requireEnv("SITE_GATE_PASSWORD"));
}

export async function isValidGateToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return timingSafeEqual(token, await sign());
}

/** Constant-time string comparison, to avoid leaking the value byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
