import "server-only";
import { clientIp } from "@/server/http/client-ip";
import { relayAuthLimiter } from "@/server/http/rate-limit";
import { errorBody } from "@/server/http/respond";
import { isRelayAuthorized } from "./auth";
import { RelayQueue } from "./queue";

export { RelayQueue, type RelayOutcome } from "./queue";
export { isRelayAuthorized } from "./auth";

// Survives Next dev hot reloads; one queue per server process (per replica in Azure).
const globalForRelay = globalThis as unknown as { __relayQueue?: RelayQueue };

export const relayQueue: RelayQueue = (globalForRelay.__relayQueue ??= new RelayQueue());

/** The relay secret, or undefined when the feature is off (FR-013). env.ts enforces the same rule. */
export function relaySecret(env: Record<string, string | undefined> = process.env): string | undefined {
  const secret = env.CAPTION_RELAY_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

export const NO_STORE = { "cache-control": "no-store" };

/**
 * Gate for the relay routes: 404 when the feature is off (indistinguishable from an unknown route),
 * uniform 401 for a missing or wrong secret, 429 after repeated failures from one client.
 */
export function guardRelayRequest(request: Request): Response | undefined {
  const secret = relaySecret();
  if (!secret) return new Response(null, { status: 404, headers: NO_STORE });
  if (isRelayAuthorized(request.headers.get("authorization"), secret)) return undefined;
  const status = relayAuthLimiter.take(clientIp(request)) ? 401 : 429;
  return Response.json(errorBody(status === 401 ? "UNAUTHORIZED" : "RATE_LIMITED"), {
    status,
    headers: NO_STORE,
  });
}
