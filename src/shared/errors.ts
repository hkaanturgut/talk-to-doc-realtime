export const ERROR_CODES = [
  "INVALID_REQUEST",
  "PDF_MISSING",
  "PDF_TOO_LARGE",
  "PDF_NOT_PDF",
  "PDF_PASSWORD_PROTECTED",
  "PDF_NO_TEXT",
  "PDF_INVALID",
  "PDF_TIMEOUT",
  "YOUTUBE_INVALID_URL",
  "YOUTUBE_NO_CAPTIONS",
  "YOUTUBE_UNAVAILABLE",
  "YOUTUBE_BLOCKED",
  "TEXT_EMPTY",
  "TEXT_TOO_LARGE",
  "DOCUMENT_NOT_FOUND",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VOICE_BUSY",
  "RELAY_JOB_NOT_FOUND",
  "REALTIME_UNAVAILABLE",
  "REALTIME_AUTH",
  "INTERNAL",
  "MIC_DENIED",
  "MIC_UNAVAILABLE",
  "WEBRTC_UNSUPPORTED",
  "TOKEN_EXPIRED",
  "MIC_LOST",
  "CONNECTION_LOST",
  "SESSION_CAP",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

interface ErrorMeta {
  status: number;
  retryable: boolean;
}

/** HTTP status and retryability per code. Client-only codes use 0. */
export const ERROR_META: Record<ErrorCode, ErrorMeta> = {
  INVALID_REQUEST: { status: 400, retryable: false },
  PDF_MISSING: { status: 400, retryable: false },
  PDF_TOO_LARGE: { status: 413, retryable: false },
  PDF_NOT_PDF: { status: 415, retryable: false },
  PDF_PASSWORD_PROTECTED: { status: 422, retryable: false },
  PDF_NO_TEXT: { status: 422, retryable: false },
  PDF_INVALID: { status: 422, retryable: false },
  PDF_TIMEOUT: { status: 504, retryable: true },
  YOUTUBE_INVALID_URL: { status: 400, retryable: false },
  YOUTUBE_NO_CAPTIONS: { status: 422, retryable: false },
  YOUTUBE_UNAVAILABLE: { status: 404, retryable: false },
  YOUTUBE_BLOCKED: { status: 502, retryable: false },
  TEXT_EMPTY: { status: 400, retryable: false },
  TEXT_TOO_LARGE: { status: 413, retryable: false },
  DOCUMENT_NOT_FOUND: { status: 404, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  UNAUTHORIZED: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  VOICE_BUSY: { status: 503, retryable: true },
  RELAY_JOB_NOT_FOUND: { status: 404, retryable: false },
  REALTIME_UNAVAILABLE: { status: 503, retryable: true },
  REALTIME_AUTH: { status: 500, retryable: false },
  INTERNAL: { status: 500, retryable: true },
  MIC_DENIED: { status: 0, retryable: false },
  MIC_UNAVAILABLE: { status: 0, retryable: false },
  WEBRTC_UNSUPPORTED: { status: 0, retryable: false },
  TOKEN_EXPIRED: { status: 0, retryable: true },
  MIC_LOST: { status: 0, retryable: true },
  CONNECTION_LOST: { status: 0, retryable: true },
  SESSION_CAP: { status: 409, retryable: false },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  /** Optional user-facing message overriding the catalog default (e.g. with the actual file size). */
  readonly userMessage?: string;

  constructor(code: ErrorCode, options: { message?: string; userMessage?: string; cause?: unknown } = {}) {
    super(options.message ?? code, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_META[code].status;
    this.retryable = ERROR_META[code].retryable;
    this.userMessage = options.userMessage;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
