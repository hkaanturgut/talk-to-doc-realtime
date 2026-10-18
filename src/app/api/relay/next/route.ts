import { guardRelayRequest, NO_STORE, relayQueue } from "@/server/ingestion/youtube/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LONG_POLL_MS = 25_000;

/** Caption relay long poll (contracts/relay-api.md): the next job, or 204 after 25 s. */
export async function GET(request: Request): Promise<Response> {
  const denied = guardRelayRequest(request);
  if (denied) return denied;
  const job = await relayQueue.next(LONG_POLL_MS, request.signal);
  return job
    ? Response.json(job, { headers: NO_STORE })
    : new Response(null, { status: 204, headers: NO_STORE });
}
