import { documentStore } from "@/server/documents";
import { createDocument, toPreview } from "@/server/documents/create";
import { clientIp } from "@/server/http/client-ip";
import { ingestLimiter } from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { normalizeText } from "@/server/ingestion/normalize";
import { trackEvent } from "@/server/telemetry";
import { AppError } from "@/shared/errors";
import { MAX_TEXT_CHARS } from "@/shared/messages";
import { TextRequestSchema } from "@/shared/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paste-transcript fallback: any text becomes a document. */
export async function POST(request: Request): Promise<Response> {
  try {
    ingestLimiter.check(clientIp(request));
    const body = TextRequestSchema.parse(await request.json().catch(() => ({})));
    if (body.text.length > MAX_TEXT_CHARS) throw new AppError("TEXT_TOO_LARGE");
    const text = normalizeText(body.text);
    if (!text) throw new AppError("TEXT_EMPTY");

    const { doc, tail } = createDocument({
      kind: "text",
      title: body.title?.trim() || "Pasted transcript",
      fullText: text,
      extra: body.sourceUrl ? { sourceUrl: body.sourceUrl } : undefined,
    });
    documentStore.put(doc);
    trackEvent("document_ingested", { kind: "text", charCount: doc.charCount, truncated: doc.truncated });
    return Response.json(toPreview(doc, tail));
  } catch (err) {
    return errorResponse(err, "ingest/text");
  }
}
