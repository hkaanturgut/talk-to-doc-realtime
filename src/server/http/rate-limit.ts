import "server-only";
import { AppError } from "@/shared/errors";

export interface RateLimiter {
  /** Consumes one token for `key`; returns false when the bucket is empty. */
  take(key: string): boolean;
  /** Throws RATE_LIMITED when the bucket is empty. */
  check(key: string): void;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket per key: `limit` tokens, refilled continuously over `windowMs`.
 * Per replica by design (documented limitation; Redis is the shared-store upgrade path).
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  const refillPerMs = limit / windowMs;

  function take(key: string): boolean {
    const t = now();
    const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: t };
    bucket.tokens = Math.min(limit, bucket.tokens + (t - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = t;
    buckets.delete(key);
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  return {
    take,
    check(key) {
      if (!take(key)) throw new AppError("RATE_LIMITED");
    },
  };
}

const MINUTE = 60_000;
export const sessionLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE });
export const ingestLimiter = createRateLimiter({ limit: 20, windowMs: MINUTE });
/** Failed caption-relay authentications per client IP. */
export const relayAuthLimiter = createRateLimiter({ limit: 10, windowMs: MINUTE });
