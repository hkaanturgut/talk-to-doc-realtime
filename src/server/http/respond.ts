import "server-only";
import { ZodError } from "zod";
import { AppError, ERROR_META, isAppError, type ErrorCode } from "@/shared/errors";
import { MESSAGES } from "@/shared/messages";
import type { ErrorBody } from "@/shared/schemas";
import { trackException } from "../telemetry";

export function errorBody(code: ErrorCode, message?: string): ErrorBody {
  return { error: { code, message: message ?? MESSAGES[code], retryable: ERROR_META[code].retryable } };
}

/** Maps any thrown value to an ErrorBody response. Never leaks stack traces or upstream details. */
export function errorResponse(err: unknown, route: string, headers?: HeadersInit): Response {
  let appError: AppError;
  if (isAppError(err)) appError = err;
  else if (err instanceof ZodError) appError = new AppError("INVALID_REQUEST", { cause: err });
  else appError = new AppError("INTERNAL", { cause: err });

  if (!isAppError(err) && !(err instanceof ZodError)) {
    trackException(err, { route, code: appError.code });
  } else if (appError.status >= 500) {
    trackException(appError.cause ?? appError, { route, code: appError.code });
  }

  return Response.json(errorBody(appError.code, appError.userMessage), { status: appError.status, headers });
}
