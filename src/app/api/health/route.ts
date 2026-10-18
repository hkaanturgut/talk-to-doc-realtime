import { relayQueue, relaySecret } from "@/server/ingestion/youtube/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const body: Record<string, unknown> = { status: "ok", version: process.env.GIT_SHA ?? "dev" };
  if (relaySecret())
    body.relay = { online: relayQueue.online(), lastSeenSeconds: relayQueue.lastSeenSeconds() };
  return Response.json(body);
}
