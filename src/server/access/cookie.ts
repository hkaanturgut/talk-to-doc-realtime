// Runs in proxy.ts and route handlers, so it uses Web Crypto only (no node:crypto).

export const ACCESS_COOKIE = "ttd_access";
/** Seven days (spec FR-004). */
export const ACCESS_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

/** HMAC key derived from the code, so rotating the code invalidates every cookie (research R2). */
async function keyFor(code: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(`ttd-access-cookie:${code}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** `v1.<expiresAtSeconds>.<signature>`; the code itself never leaves the server. */
export async function signAccessCookie(code: string, now = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(now / 1000) + ACCESS_COOKIE_MAX_AGE}`;
  const sig = await crypto.subtle.sign("HMAC", await keyFor(code), encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Constant-time signature check (`subtle.verify`) plus expiry. */
export async function verifyAccessCookie(
  value: string | undefined,
  code: string,
  now = Date.now(),
): Promise<boolean> {
  const match = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(value ?? "");
  if (!match) return false;
  const [, exp, sigText] = match;
  if (Number(exp) * 1000 <= now) return false;
  const sig = fromBase64Url(sigText!);
  if (!sig) return false;
  return crypto.subtle.verify("HMAC", await keyFor(code), sig, encoder.encode(`v1.${exp}`));
}
