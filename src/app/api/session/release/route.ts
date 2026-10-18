import { errorResponse } from "@/server/http/respond";
import { voiceLeases } from "@/server/realtime/leases";
import { AppError } from "@/shared/errors";
import { LeaseRequestSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Frees a voice slot. Accepts `text/plain` JSON because `navigator.sendBeacon` sends that. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 1024) throw new AppError("INVALID_REQUEST");
    const raw = await request.text();
    if (raw.length > 1024) throw new AppError("INVALID_REQUEST");
    const { leaseId } = LeaseRequestSchema.parse(JSON.parse(raw || "{}"));
    voiceLeases.release(leaseId);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    if (err instanceof SyntaxError)
      return errorResponse(new AppError("INVALID_REQUEST"), "session/release", NO_STORE);
    return errorResponse(err, "session/release", NO_STORE);
  }
}
