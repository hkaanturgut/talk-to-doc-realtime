import { errorResponse } from "@/server/http/respond";
import { voiceLeases } from "@/server/realtime/leases";
import { AppError } from "@/shared/errors";
import { LeaseRequestSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Keeps a voice slot alive; 409 SESSION_CAP after 15 minutes (feature 003). */
export async function POST(request: Request): Promise<Response> {
  try {
    const { leaseId } = LeaseRequestSchema.parse(await request.json().catch(() => ({})));
    const result = voiceLeases.heartbeat(leaseId);
    if (result === "cap") throw new AppError("SESSION_CAP");
    return new Response(null, { status: result === "ok" ? 204 : 404, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, "session/heartbeat", NO_STORE);
  }
}
