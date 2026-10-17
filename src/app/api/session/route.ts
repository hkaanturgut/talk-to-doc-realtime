import { documentStore } from "@/server/documents";
import { clientIp } from "@/server/http/client-ip";
import { sessionLimiter } from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { getRealtimeProvider } from "@/server/realtime";
import { buildInstructions } from "@/server/realtime/instructions";
import { buildSessionConfig } from "@/server/realtime/session-config";
import { trackEvent } from "@/server/telemetry";
import { AppError, isAppError } from "@/shared/errors";
import { SessionRequestSchema, type SessionResponse } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const SESSION_MAX_SECONDS = 900;

export async function POST(request: Request): Promise<Response> {
  let mode: string | undefined;
  try {
    sessionLimiter.check(clientIp(request));
    const body = SessionRequestSchema.parse(await request.json().catch(() => ({})));
    mode = body.mode;

    const doc = documentStore.get(body.documentId);
    if (!doc) throw new AppError("DOCUMENT_NOT_FOUND");

    const provider = await getRealtimeProvider();
    const instructions = buildInstructions({
      title: doc.title,
      kind: doc.kind,
      contextText: doc.contextText,
      truncated: doc.truncated,
      usedRatio: doc.usedRatio,
      history: body.history,
    });
    const session = buildSessionConfig({
      mode: body.mode,
      model: provider.model,
      transcribeModel: provider.transcribeModel,
      instructions,
    });
    const secret = await provider.createClientSecret(session);

    trackEvent("session_created", { mode: body.mode, provider: provider.name, kind: doc.kind });
    const response: SessionResponse = {
      clientSecret: secret.value,
      expiresAt: secret.expiresAt,
      callsUrl: provider.callsUrl,
      model: provider.model,
      provider: provider.name,
      sessionMaxSeconds: SESSION_MAX_SECONDS,
    };
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    trackEvent("session_failed", { mode, code: isAppError(err) ? err.code : "INTERNAL" });
    return errorResponse(err, "session", { "Cache-Control": "no-store" });
  }
}
