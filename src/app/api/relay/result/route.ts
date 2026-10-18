import { errorResponse } from "@/server/http/respond";
import { guardRelayRequest, NO_STORE, relayQueue } from "@/server/ingestion/youtube/relay";
import { AppError } from "@/shared/errors";
import { RelayResultSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Caption relay result (contracts/relay-api.md): accepted once, only for a job still in flight. */
export async function POST(request: Request): Promise<Response> {
  const denied = guardRelayRequest(request);
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
      throw new AppError("INVALID_REQUEST");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new AppError("INVALID_REQUEST");
    const result = RelayResultSchema.parse(JSON.parse(raw || "null"));
    if (!relayQueue.complete(result)) throw new AppError("RELAY_JOB_NOT_FOUND");
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    if (err instanceof SyntaxError)
      return errorResponse(new AppError("INVALID_REQUEST"), "relay/result", NO_STORE);
    return errorResponse(err, "relay/result", NO_STORE);
  }
}
