import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Constant-time check of `Authorization: Bearer <secret>`. Hashing first gives equal-length
 * buffers, so neither the secret's length nor a matching prefix leaks through timing.
 */
export function isRelayAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  const presented = match?.[1] ?? "";
  return timingSafeEqual(digest(presented), digest(secret)) && presented.length > 0;
}
