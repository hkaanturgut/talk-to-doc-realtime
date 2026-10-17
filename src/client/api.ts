import { AppError, ERROR_CODES, type ErrorCode } from "@/shared/errors";
import { MESSAGES } from "@/shared/messages";
import {
  ErrorBodySchema,
  PreviewSchema,
  SessionResponseSchema,
  type PreviewDTO,
  type SessionRequest,
  type SessionResponse,
} from "@/shared/schemas";

/** Converts an error response body into an AppError carrying the server's user message. */
export function errorFromBody(body: unknown, fallback: ErrorCode = "INTERNAL"): AppError {
  const parsed = ErrorBodySchema.safeParse(body);
  if (parsed.success) {
    return new AppError(parsed.data.error.code, { userMessage: parsed.data.error.message });
  }
  return new AppError(fallback);
}

export function userMessage(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.userMessage ?? MESSAGES[err.code] };
  const code = (err as { code?: string })?.code;
  if (code && (ERROR_CODES as readonly string[]).includes(code)) {
    return { code: code as ErrorCode, message: MESSAGES[code as ErrorCode] };
  }
  return { code: "INTERNAL", message: MESSAGES.INTERNAL };
}

async function postJson(url: string, body: unknown, fallback: ErrorCode): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new AppError(fallback, { cause });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw errorFromBody(json, fallback);
  return json;
}

export async function fetchSession(req: SessionRequest): Promise<SessionResponse> {
  return SessionResponseSchema.parse(await postJson("/api/session", req, "REALTIME_UNAVAILABLE"));
}

export async function ingestYouTube(url: string): Promise<PreviewDTO> {
  return PreviewSchema.parse(await postJson("/api/ingest/youtube", { url }, "INTERNAL"));
}

export async function ingestText(body: {
  title?: string;
  text: string;
  sourceUrl?: string;
}): Promise<PreviewDTO> {
  return PreviewSchema.parse(await postJson("/api/ingest/text", body, "INTERNAL"));
}

export interface UploadHandle {
  promise: Promise<PreviewDTO>;
  cancel(): void;
}

/** Uploads a PDF with progress events (XHR, since fetch has no upload progress). */
export function uploadPdf(
  file: File,
  onProgress: (ratio: number, phase: "uploading" | "extracting") => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<PreviewDTO>((resolve, reject) => {
    xhr.open("POST", "/api/ingest/pdf");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(e.loaded / e.total, e.loaded >= e.total ? "extracting" : "uploading");
    };
    xhr.upload.onload = () => onProgress(1, "extracting");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = PreviewSchema.safeParse(xhr.response);
        if (parsed.success) resolve(parsed.data);
        else reject(new AppError("INTERNAL"));
      } else {
        reject(errorFromBody(xhr.response, xhr.status === 413 ? "PDF_TOO_LARGE" : "INTERNAL"));
      }
    };
    xhr.onerror = () => reject(new AppError("INTERNAL"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    const form = new FormData();
    form.set("file", file);
    xhr.send(form);
  });
  return { promise, cancel: () => xhr.abort() };
}
