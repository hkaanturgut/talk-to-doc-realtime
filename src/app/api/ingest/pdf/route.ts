import { documentStore } from "@/server/documents";
import { createDocument, toPreview } from "@/server/documents/create";
import { requireAccess } from "@/server/access/require";
import { clientIp } from "@/server/http/client-ip";
import { ingestLimiter } from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { extractPdf } from "@/server/ingestion/pdf";
import { trackEvent } from "@/server/telemetry";
import { AppError } from "@/shared/errors";
import { formatMb, MAX_PDF_BYTES } from "@/shared/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MULTIPART_OVERHEAD = 64 * 1024;

function tooLarge(bytes: number): AppError {
  return new AppError("PDF_TOO_LARGE", {
    userMessage: `This PDF is ${formatMb(bytes)}. The limit is 25 MB.`,
  });
}

function titleFrom(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  return base.length > 0 ? base.slice(0, 200) : "Untitled PDF";
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAccess(request);
    ingestLimiter.check(clientIp(request));

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_PDF_BYTES + MULTIPART_OVERHEAD) throw tooLarge(declared);

    let form: FormData;
    try {
      form = await request.formData();
    } catch (cause) {
      throw new AppError("PDF_MISSING", { cause });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("PDF_MISSING");
    if (file.size > MAX_PDF_BYTES) throw tooLarge(file.size);

    // Bytes stay in memory only for extraction; only the extracted text is stored (FR-025).
    const extraction = await extractPdf(new Uint8Array(await file.arrayBuffer()));
    const { doc, tail } = createDocument({
      kind: "pdf",
      title: titleFrom(file.name),
      fullText: extraction.text,
      pageCount: extraction.pageCount,
      pageOffsets: extraction.pageOffsets,
    });
    documentStore.put(doc);

    trackEvent("document_ingested", {
      kind: "pdf",
      sizeBytes: file.size,
      charCount: doc.charCount,
      truncated: doc.truncated,
    });
    return Response.json(toPreview(doc, tail));
  } catch (err) {
    return errorResponse(err, "ingest/pdf");
  }
}
